-- Contributions : un utilisateur connecté propose un prix et, si besoin, le
-- produit et le magasin concernés. Rien n'est public avant validation par un
-- modérateur. Le classement ne s'achète pas : aucun champ ici ne l'influence.

-- ───────────────────────── Modérateurs ─────────────────────────
-- Table sans aucun droit client : on ne devient modérateur que côté serveur
-- (voir `pnpm db:moderator`).
create table public.moderators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.moderators enable row level security;
revoke all on public.moderators from anon, authenticated;

create function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.moderators where user_id = (select auth.uid()));
$$;
-- Appelée dans des politiques évaluées aussi pour les visiteurs : elle répond « non ».
grant execute on function public.is_moderator() to anon, authenticated;

-- ───────────────────────── Produits et magasins proposés ─────────────────────────
-- Défaut « accepted » : les imports serveur (service_role) restent publiés.
-- Les propositions d'utilisateurs passent par les fonctions ci-dessous, qui forcent « pending ».
alter table public.products
  add column review_status public.review_status not null default 'accepted',
  add column submitted_by uuid references public.profiles (id) on delete set null;
alter table public.stores
  add column review_status public.review_status not null default 'accepted',
  add column submitted_by uuid references public.profiles (id) on delete set null;
alter table public.price_observations
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz;

drop policy "lecture publique" on public.products;
drop policy "lecture publique" on public.stores;
create policy "lire les produits publiés, les siens, ou tout si modérateur" on public.products
  for select to anon, authenticated
  using (review_status = 'accepted' or submitted_by = (select auth.uid()) or (select public.is_moderator()));
create policy "lire les magasins publiés, les siens, ou tout si modérateur" on public.stores
  for select to anon, authenticated
  using (review_status = 'accepted' or submitted_by = (select auth.uid()) or (select public.is_moderator()));
create policy "un modérateur lit tous les relevés" on public.price_observations
  for select to authenticated using ((select public.is_moderator()));

-- Source unique des contributions.
insert into public.data_sources (slug, name)
values ('contributions', 'Contributions des utilisateurs')
on conflict (slug) do nothing;

-- ───────────────────────── Proposer un produit ─────────────────────────
-- Renvoie le produit existant si le code-barres est déjà connu (même en attente),
-- pour ne jamais créer de doublon.
create function public.propose_product(
  p_name text,
  p_brand text,
  p_brand_type public.brand_type,
  p_category_id uuid,
  p_barcode text,
  p_quantity_amount numeric,
  p_quantity_unit public.content_unit,
  p_pack_count integer,
  p_uses_count integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_brand uuid;
  v_id uuid;
  v_barcode text := nullif(btrim(p_barcode), '');
  v_brand_name text := nullif(btrim(p_brand), '');
begin
  if me is null then
    raise exception 'Authentification requise' using errcode = '28000';
  end if;
  if v_barcode is not null then
    select id into v_id from public.products where barcode = v_barcode;
    if v_id is not null then return v_id; end if;
  end if;
  if v_brand_name is not null then
    if char_length(v_brand_name) > 80 then
      raise exception 'Nom de marque trop long' using errcode = '22001';
    end if;
    select id into v_brand from public.brands where lower(name) = lower(v_brand_name);
    if v_brand is null then
      insert into public.brands (name, brand_type) values (v_brand_name, p_brand_type) returning id into v_brand;
    end if;
  end if;
  insert into public.products
    (name, brand_id, category_id, barcode, quantity_amount, quantity_unit, pack_count, uses_count,
     source_id, review_status, submitted_by)
  values
    (btrim(p_name), v_brand, p_category_id, v_barcode, p_quantity_amount, p_quantity_unit,
     coalesce(p_pack_count, 1), p_uses_count,
     (select id from public.data_sources where slug = 'contributions'), 'pending', me)
  returning id into v_id;
  return v_id;
end;
$$;

-- ───────────────────────── Proposer un magasin ─────────────────────────
create function public.propose_store(
  p_retailer text,
  p_name text,
  p_postal_code text,
  p_city text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_retailer uuid;
  v_id uuid;
  v_retailer_name text := nullif(btrim(p_retailer), '');
  v_name text := btrim(p_name);
  v_city text := btrim(p_city);
begin
  if me is null then
    raise exception 'Authentification requise' using errcode = '28000';
  end if;
  if char_length(v_name) not between 1 and 120 or char_length(v_city) not between 1 and 80
     or char_length(coalesce(v_retailer_name, '')) > 80 then
    raise exception 'Nom de magasin, de ville ou d''enseigne invalide' using errcode = '22001';
  end if;
  if v_retailer_name is not null then
    select id into v_retailer from public.retailers where lower(name) = lower(v_retailer_name);
    if v_retailer is null then
      insert into public.retailers (name) values (v_retailer_name) returning id into v_retailer;
    end if;
  end if;
  select id into v_id from public.stores
  where lower(name) = lower(v_name) and postal_code = p_postal_code
    and retailer_id is not distinct from v_retailer;
  if v_id is not null then return v_id; end if;
  insert into public.stores (retailer_id, name, postal_code, city, review_status, submitted_by)
  values (v_retailer, v_name, p_postal_code, v_city, 'pending', me)
  returning id into v_id;
  return v_id;
end;
$$;

-- ───────────────────────── Valider ou refuser un relevé ─────────────────────────
-- Valider un relevé publie aussi le produit et le magasin qu'il concerne.
create function public.review_observation(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_product uuid;
  v_store uuid;
begin
  if not public.is_moderator() then
    raise exception 'Réservé aux modérateurs' using errcode = '42501';
  end if;
  update public.price_observations
  set review_status = case when p_accept then 'accepted' else 'rejected' end::public.review_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_id and review_status = 'pending'
  returning product_id, store_id into v_product, v_store;
  if not found then
    raise exception 'Relevé introuvable ou déjà traité' using errcode = 'P0002';
  end if;
  if p_accept then
    update public.products set review_status = 'accepted' where id = v_product and review_status = 'pending';
    update public.stores set review_status = 'accepted' where id = v_store and review_status = 'pending';
  end if;
end;
$$;

revoke execute on function
  public.propose_product(text, text, public.brand_type, uuid, text, numeric, public.content_unit, integer, integer),
  public.propose_store(text, text, text, text),
  public.review_observation(uuid, boolean)
from public, anon;
grant execute on function
  public.propose_product(text, text, public.brand_type, uuid, text, numeric, public.content_unit, integer, integer),
  public.propose_store(text, text, text, text),
  public.review_observation(uuid, boolean)
to authenticated;

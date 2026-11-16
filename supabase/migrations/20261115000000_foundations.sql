-- Le vrai prix — fondations : comptes, foyers, catalogue, magasins, observations de prix.
--
-- Principes :
--   * Sécurité au niveau des lignes (RLS) activée sur TOUTES les tables.
--   * Le catalogue et les prix validés sont lisibles sans compte (mode découverte).
--   * Les données personnelles sont privées par défaut.
--   * Une observation soumise par un utilisateur entre en « pending » : elle n'est
--     visible publiquement qu'après validation, pour ne pas polluer la base.
--   * Les données de démonstration fictives ne sont JAMAIS insérées ici : elles
--     vivent dans le package @lvp/demo-data.

create type public.brand_type as enum ('national', 'private_label');
create type public.comparison_basis as enum ('per_wash', 'per_litre', 'per_kg', 'per_unit');
create type public.content_unit as enum ('ml', 'l', 'g', 'kg', 'unit');
create type public.collection_method as enum (
  'receipt', 'shelf_label', 'retailer_feed', 'community_report', 'manual_entry', 'model_estimate'
);
create type public.review_status as enum ('pending', 'accepted', 'rejected');
create type public.household_kind as enum ('family', 'couple', 'flatshare', 'other');
create type public.household_role as enum ('admin', 'member', 'guest');

-- ───────────────────────── Comptes ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  city text check (char_length(city) <= 80),
  created_at timestamptz not null default now()
);

-- Crée le profil à l'inscription.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Foyers ─────────────────────────

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  kind public.household_kind not null default 'family',
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

-- Fonctions « security definer » : évitent la récursion des politiques RLS.
create function public.is_household_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target and m.user_id = (select auth.uid())
  );
$$;

create function public.is_household_admin(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = target and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

-- Le créateur d'un foyer en devient administrateur.
create function public.handle_new_household() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_household_created
  after insert on public.households
  for each row execute function public.handle_new_household();

-- ───────────────────────── Catalogue ─────────────────────────

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  parent_id uuid references public.categories (id) on delete restrict,
  comparison_basis public.comparison_basis not null,
  fallback_basis public.comparison_basis
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  brand_type public.brand_type not null default 'national'
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  license text,
  attribution_url text
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  brand_id uuid references public.brands (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  barcode text unique check (barcode ~ '^[0-9]{8,14}$'),
  quantity_amount numeric(12, 3) not null check (quantity_amount > 0),
  quantity_unit public.content_unit not null,
  pack_count integer not null default 1 check (pack_count > 0),
  uses_count integer check (uses_count > 0),
  packaging text,
  image_path text,
  source_id uuid references public.data_sources (id) on delete set null,
  created_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);

-- ───────────────────────── Magasins ─────────────────────────

create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid references public.retailers (id) on delete restrict,
  name text not null,
  address text,
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  -- Identifiant OpenStreetMap, pour l'interopérabilité (ex. Open Prices).
  osm_type text check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint,
  unique (osm_type, osm_id)
);
create index stores_postal_code_idx on public.stores (postal_code);

-- ───────────────────────── Observations de prix ─────────────────────────

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  observed_at timestamptz not null check (observed_at <= now() + interval '1 day'),
  price_cents integer not null check (price_cents > 0 and price_cents < 100000000),
  -- Quantité constatée ce jour-là : indispensable pour détecter la réduflation.
  quantity_amount numeric(12, 3) not null check (quantity_amount > 0),
  quantity_unit public.content_unit not null,
  pack_count integer not null default 1 check (pack_count > 0),
  uses_count integer check (uses_count > 0),
  is_promo boolean not null default false,
  promo_reference_price_cents integer check (promo_reference_price_cents > 0),
  promo_label text check (char_length(promo_label) <= 80),
  source_id uuid not null references public.data_sources (id) on delete restrict,
  method public.collection_method not null,
  confirmations integer not null default 0 check (confirmations >= 0),
  review_status public.review_status not null default 'pending',
  submitted_by uuid references public.profiles (id) on delete set null,
  -- Chemin de la preuve (ticket, étiquette) dans un bucket privé.
  proof_path text,
  created_at timestamptz not null default now()
);
create index price_observations_lookup_idx
  on public.price_observations (product_id, store_id, observed_at desc);
create index price_observations_pending_idx
  on public.price_observations (created_at) where review_status = 'pending';

-- ───────────────────────── Préférences utilisateur ─────────────────────────

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.user_stores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  primary key (user_id, store_id)
);

-- ───────────────────────── Sécurité (RLS) ─────────────────────────

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.data_sources enable row level security;
alter table public.products enable row level security;
alter table public.retailers enable row level security;
alter table public.stores enable row level security;
alter table public.price_observations enable row level security;
alter table public.favorites enable row level security;
alter table public.user_stores enable row level security;

-- Référentiels publics : lecture seule pour tous ; écriture réservée au serveur (service_role).
create policy "lecture publique" on public.categories for select to anon, authenticated using (true);
create policy "lecture publique" on public.brands for select to anon, authenticated using (true);
create policy "lecture publique" on public.data_sources for select to anon, authenticated using (true);
create policy "lecture publique" on public.products for select to anon, authenticated using (true);
create policy "lecture publique" on public.retailers for select to anon, authenticated using (true);
create policy "lecture publique" on public.stores for select to anon, authenticated using (true);

-- Profils : chacun ne voit et ne modifie que le sien.
create policy "lire son profil" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "modifier son profil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Foyers.
create policy "lire ses foyers" on public.households for select to authenticated
  using (public.is_household_member(id) or created_by = (select auth.uid()));
create policy "créer un foyer" on public.households for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "administrer son foyer" on public.households for update to authenticated
  using (public.is_household_admin(id)) with check (public.is_household_admin(id));
create policy "supprimer son foyer" on public.households for delete to authenticated
  using (public.is_household_admin(id));

create policy "voir les membres de ses foyers" on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
create policy "ajouter des membres" on public.household_members for insert to authenticated
  with check (public.is_household_admin(household_id));
create policy "modifier les rôles" on public.household_members for update to authenticated
  using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));
create policy "retirer un membre ou quitter" on public.household_members for delete to authenticated
  using (public.is_household_admin(household_id) or user_id = (select auth.uid()));

-- Observations : le public ne lit que ce qui est validé ; l'auteur voit aussi ses envois.
create policy "lire les prix validés" on public.price_observations for select to anon, authenticated
  using (review_status = 'accepted');
create policy "lire ses propres envois" on public.price_observations for select to authenticated
  using (submitted_by = (select auth.uid()));
-- Un utilisateur ne peut soumettre qu'en son nom, en attente de validation, sans
-- confirmations, et jamais avec une méthode réservée au serveur.
create policy "soumettre un prix" on public.price_observations for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and review_status = 'pending'
    and confirmations = 0
    and method in ('receipt', 'shelf_label', 'community_report', 'manual_entry')
  );

create policy "gérer ses favoris" on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "gérer ses magasins" on public.user_stores for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────────────────── Droits ─────────────────────────
-- Explicites : on ne dépend pas des droits par défaut du projet.

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on public.categories, public.brands, public.data_sources, public.products,
  public.retailers, public.stores, public.price_observations to anon, authenticated;

grant select, update (display_name, postal_code, city) on public.profiles to authenticated;
grant select, insert, update, delete on public.households, public.household_members to authenticated;
grant insert on public.price_observations to authenticated;
grant select, insert, delete on public.favorites, public.user_stores to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_household() from public;

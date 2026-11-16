-- Preuves photo (étiquette en rayon, ticket de caisse) jointes à un relevé.
--
-- Bucket PRIVÉ : une preuve n'est lisible que par son auteur et par les
-- modérateurs, jamais par le public. Chaque utilisateur dépose dans un dossier
-- à son identifiant. Les fichiers sont supprimés par l'application elle-même
-- (l'API de stockage) avant la suppression du compte.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "déposer une preuve dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "lire ses preuves, ou toutes si modérateur" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_moderator()))
  );

create policy "supprimer ses preuves" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Un relevé ne peut se dire « ticket » ou « étiquette » que s'il porte une
-- preuve rangée dans le dossier de son auteur. Sans preuve, il reste un
-- signalement : la confiance affichée en dépend.
drop policy "soumettre un prix" on public.price_observations;
create policy "soumettre un prix" on public.price_observations for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and review_status = 'pending'
    and confirmations = 0
    and (
      (proof_path is null and method in ('community_report', 'manual_entry'))
      or (
        proof_path is not null
        and method in ('receipt', 'shelf_label')
        and proof_path like (select auth.uid())::text || '/%'
      )
    )
  );

-- Suppression de compte : les relevés conservés (anonymisés) ne gardent
-- aucune référence vers une photo de leur ancien auteur.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Authentification requise' using errcode = '28000';
  end if;
  update public.price_observations set proof_path = null where submitted_by = me and proof_path is not null;
  delete from auth.users where id = me;
end;
$$;

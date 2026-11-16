-- Droit à l'effacement (RGPD, art. 17) : l'utilisateur supprime lui-même son compte.
--
-- La suppression de auth.users entraîne par cascade celle du profil, des
-- favoris, des magasins enregistrés et des foyers créés. Les prix déjà
-- contribués restent dans le catalogue mais sont anonymisés
-- (price_observations.submitted_by passe à NULL).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Authentification requise' using errcode = '28000';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

#!/bin/sh
# Donne le rôle de modérateur à un compte existant de la base LOCALE (Docker).
# Usage : pnpm db:moderator adresse@exemple.fr
set -e
[ -n "$1" ] || { echo "Usage : pnpm db:moderator adresse@exemple.fr"; exit 1; }
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
docker exec -i supabase_db_le-vrai-prix psql -U postgres -v ON_ERROR_STOP=1 -v email="$1" <<'SQL'
insert into public.moderators (user_id)
select id from auth.users where email = lower(:'email')
on conflict do nothing;
select case when exists (
  select 1 from public.moderators m join auth.users u on u.id = m.user_id where u.email = lower(:'email')
) then 'OK : ' || :'email' || ' est modérateur.'
  else 'Aucun compte avec cette adresse : créez-le d''abord dans l''application.' end as resultat;
SQL

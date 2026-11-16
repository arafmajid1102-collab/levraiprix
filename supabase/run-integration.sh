#!/bin/sh
# Lance les tests d'intégration contre le Supabase local (Docker).
# Les clés sont lues depuis `supabase status` et ne sont écrites nulle part.
set -e
cd "$(dirname "$0")/.."
eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEY|SECRET_KEY|MAILPIT_URL)=')"
export LVP_SUPABASE_URL="$API_URL"
export LVP_SUPABASE_PUBLIC_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}"
export LVP_SUPABASE_SECRET_KEY="${SECRET_KEY:-$SERVICE_ROLE_KEY}"
export LVP_MAILPIT_URL="$MAILPIT_URL"
[ -n "$LVP_SUPABASE_URL" ] || { echo "Supabase local n'est pas démarré : lancez pnpm db:start"; exit 1; }
pnpm --filter @lvp/data-supabase exec vitest run src/integration.test.ts

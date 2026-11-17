#!/bin/sh
# Lance l'application pour un essai sur un VRAI téléphone (Expo Go), relié au
# même Wi-Fi que ce Mac. Le téléphone ne peut pas joindre « 127.0.0.1 » : on
# lui donne l'adresse du Mac sur le réseau local, recalculée à chaque lancement.
set -e
cd "$(dirname "$0")"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
[ -n "$IP" ] || { echo "Ce Mac n'est connecté à aucun réseau Wi-Fi ou Ethernet."; exit 1; }
KEY=$(grep '^EXPO_PUBLIC_SUPABASE_KEY=' .env.local 2>/dev/null | cut -d= -f2-)
[ -n "$KEY" ] || { echo "apps/mobile/.env.local est absent : voir .env.example."; exit 1; }
if ! curl -s -m 5 -o /dev/null -H "apikey: $KEY" "http://$IP:54321/auth/v1/health"; then
  echo "La base locale ne répond pas sur http://$IP:54321 : lancez d'abord « pnpm db:start »."
  exit 1
fi
echo "Base locale : http://$IP:54321 — le téléphone doit être sur le même Wi-Fi que ce Mac."
# Variable distincte de celle de .env.local : en développement, Expo relit ce
# fichier et son 127.0.0.1 l'emporterait sur une variable du même nom.
EXPO_PUBLIC_SUPABASE_LAN_URL="http://$IP:54321" exec pnpm exec expo start --lan --clear

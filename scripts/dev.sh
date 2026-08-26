#!/usr/bin/env bash
# Développement local : API sur :3001, app Vite sur :5173 (proxy vers l'API).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.dev ]; then
  echo "Créez .env.dev — voir .env.example. Exemple minimal :"
  echo '  DATABASE_URL="postgres://USER@127.0.0.1:5432/gardemanger_dev"'
  echo '  HOUSEHOLD_PASSWORD="mot-de-passe-de-dev"'
  echo '  COOKIE_SECURE="false"'
  echo '  PORT="3001"'
  exit 1
fi

set -a; . ./.env.dev; set +a

( cd server && npm run dev ) &
API=$!
( cd web && npm run dev ) &
WEB=$!

trap 'kill $API $WEB 2>/dev/null || true' EXIT INT TERM
wait

#!/usr/bin/env bash
# Restaure une sauvegarde produite par scripts/backup.sh.
#   ./scripts/restore.sh backups/db-2026-08-26_0300.dump
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:-}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "Usage : $0 <fichier .dump>"; exit 1; }

set -a; . ./.env; set +a

echo "⚠️  Cette opération remplace le contenu actuel de la base $POSTGRES_DB."
read -r -p "Continuer ? [oui/non] " ANSWER
[ "$ANSWER" = "oui" ] || exit 1

docker compose stop app
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}_old" \
  -c "ALTER DATABASE $POSTGRES_DB RENAME TO ${POSTGRES_DB}_old" \
  -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER"
docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < "$DUMP"
docker compose start app

echo "Restauration terminée. L'ancienne base reste sous ${POSTGRES_DB}_old."

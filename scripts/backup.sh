#!/bin/sh
# Sauvegarde quotidienne : dump PostgreSQL + photos locales.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups

while true; do
  STAMP="$(date +%Y-%m-%d_%H%M)"
  echo "[backup] $STAMP — dump de $PGDATABASE"
  if pg_dump --format=custom --file="/backups/db-$STAMP.dump.part"; then
    mv "/backups/db-$STAMP.dump.part" "/backups/db-$STAMP.dump"
  else
    echo "[backup] échec du dump" >&2
    rm -f "/backups/db-$STAMP.dump.part"
  fi

  if [ -d /data/uploads ] && [ -n "$(ls -A /data/uploads 2>/dev/null)" ]; then
    tar -czf "/backups/uploads-$STAMP.tar.gz" -C /data uploads || echo "[backup] échec des photos" >&2
  fi

  find /backups -name 'db-*.dump'        -mtime "+$KEEP" -delete
  find /backups -name 'uploads-*.tar.gz' -mtime "+$KEEP" -delete

  # Prochaine sauvegarde le lendemain à 03h00.
  NOW=$(date +%s)
  NEXT=$(date -d 'tomorrow 03:00' +%s 2>/dev/null || echo $((NOW + 86400)))
  sleep $((NEXT - NOW))
done

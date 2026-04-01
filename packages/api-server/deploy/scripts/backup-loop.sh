#!/bin/sh
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p /backups

while true; do
  ts="$(date +%Y%m%d-%H%M%S)"
  output="/backups/marketpos-${ts}.sql.gz"

  echo "[backup] start ${ts}"
  pg_dump --clean --if-exists --no-owner --no-privileges "${DATABASE_URL}" | gzip -9 > "${output}"
  echo "[backup] done ${output}"

  find /backups -type f -name '*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete || true
  sleep 86400
done


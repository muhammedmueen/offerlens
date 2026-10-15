#!/usr/bin/env bash
# OfferLens — dump the Postgres container to a gzipped file, keep 7 days.
#
# No secrets in this script: pg_dump runs INSIDE the container as the postgres superuser via
# `docker exec`, so no password is needed or printed. Run as the deploy user.
#
# Env overrides (all optional):
#   BACKUP_DIR   where dumps land            (default: /srv/offerlens/backups)
#   CONTAINER    the postgres container name (default: offerlens-postgres-1)
#   PGUSER       db user inside the container(default: offerlens)
#   PGDATABASE   db name                     (default: offerlens)
#   KEEP_DAYS    retention in days           (default: 7)
#
# Cron (deploy user's crontab, daily 02:30):
#   30 2 * * * /srv/offerlens/deploy/scripts/backup-postgres.sh >> /srv/offerlens/backups/backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/offerlens/backups}"
CONTAINER="${CONTAINER:-offerlens-postgres-1}"
PGUSER="${PGUSER:-offerlens}"
PGDATABASE="${PGDATABASE:-offerlens}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
outfile="$BACKUP_DIR/offerlens-$stamp.sql.gz"

echo "[backup] dumping $PGDATABASE from container $CONTAINER -> $outfile"
docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$PGDATABASE" | gzip > "$outfile"

echo "[backup] pruning dumps older than $KEEP_DAYS days in $BACKUP_DIR"
# -mtime +N deletes files strictly older than N days; the glob is fixed, not a variable.
find "$BACKUP_DIR" -maxdepth 1 -name 'offerlens-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -delete

echo "[backup] done: $outfile ($(du -h "$outfile" | cut -f1))"

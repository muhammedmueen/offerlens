#!/usr/bin/env bash
# OfferLens — restore a gzipped pg_dump into the Postgres container. DESTRUCTIVE: it replaces
# the current database contents. Prompts for confirmation before touching anything.
#
# No secrets: psql runs INSIDE the container via `docker exec`. Run as the deploy user.
#
#   ./restore-postgres.sh /srv/offerlens/backups/offerlens-YYYYMMDD-HHMMSS.sql.gz
#
# Env overrides (optional):
#   CONTAINER    postgres container name (default: offerlens-postgres-1)
#   PGUSER       db user                 (default: offerlens)
#   PGDATABASE   db name                 (default: offerlens)
set -euo pipefail

CONTAINER="${CONTAINER:-offerlens-postgres-1}"
PGUSER="${PGUSER:-offerlens}"
PGDATABASE="${PGDATABASE:-offerlens}"

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  echo "usage: $0 <path-to-dump.sql.gz>" >&2
  exit 1
fi
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "error: no such file: $BACKUP_FILE" >&2
  exit 1
fi

echo "About to RESTORE into database '$PGDATABASE' in container '$CONTAINER'."
echo "This OVERWRITES the current data with the contents of:"
echo "  $BACKUP_FILE"
read -r -p "Type 'restore' to proceed: " confirm
if [[ "$confirm" != "restore" ]]; then
  echo "aborted."
  exit 1
fi

echo "[restore] streaming $BACKUP_FILE into $PGDATABASE ..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE"

echo "[restore] done."

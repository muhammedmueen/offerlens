#!/usr/bin/env bash
# OfferLens — one-command server-side redeploy. Collapses the "rebuild + restart + health-gate +
# fix static perms + reload nginx" steps of docs/DEPLOY_VPS.md (§5, §7 copy, §8 reload, §10) into
# one idempotent, safe-to-re-run command.
#
# Run AS the `deploy` user ON the server. It uses `sudo` for every docker/nginx command because
# `deploy` is in `sudo` but NOT in the `docker` group on this box.
#
# No secrets in this script: it never reads or prints .env.production; docker/compose load it.
# Safe on a SHARED production box: it never touches other domains' nginx, never prunes
# aggressively, never exposes a port, and bails loudly on a failed health check or `nginx -t`.
#
#   ./deploy.sh                 # rebuild backend, health-gate, fix dist perms, reload nginx
#   ./deploy.sh --check         # pre-flight only (free -h + compose ps), change nothing
#   ./deploy.sh --skip-nginx    # skip the `nginx -t && reload` step (most redeploys don't need it)
#   ./deploy.sh --prune         # also run `docker image prune -f` (dangling only) at the end
#   ./deploy.sh --help
#
# Env overrides (optional):
#   DEPLOY_DIR   dir holding docker-compose.prod.yml + .env.production (default: /srv/offerlens/deploy)
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/srv/offerlens/deploy}"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:8100/api/v1/health"
DIST_DIR="/var/www/offerlens/dist"
DATASETS_DIR="/var/www/offerlens/datasets"

# ponytail: health poll is a fixed ~30s (15 tries × 2s), not configurable. Bump these two if a
# cold api start ever needs longer.
HEALTH_TRIES=15
HEALTH_SLEEP=2

DO_CHECK=0
DO_SKIP_NGINX=0
DO_PRUNE=0

usage() {
  # Pull the leading comment block as help so there is one source of truth.
  sed -n '2,/^set -euo/p' "$0" | sed '/^set -euo/d; s/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --check) DO_CHECK=1 ;;
    --skip-nginx) DO_SKIP_NGINX=1 ;;
    --prune) DO_PRUNE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument '$arg' (see --help)" >&2; exit 1 ;;
  esac
done

banner() {
  echo ""
  echo "=== $* ==="
}

# ── a. resolve + validate the deploy dir ──────────────────────────────────
if [[ ! -f "$DEPLOY_DIR/$COMPOSE_FILE" ]]; then
  echo "error: $DEPLOY_DIR/$COMPOSE_FILE not found (set DEPLOY_DIR?)" >&2
  exit 1
fi
if [[ ! -f "$DEPLOY_DIR/.env.production" ]]; then
  echo "error: $DEPLOY_DIR/.env.production not found — write it first (DEPLOY_VPS §4)" >&2
  exit 1
fi
cd "$DEPLOY_DIR"

# ── b. pre-flight: show state before changing anything ────────────────────
banner "Pre-flight: memory headroom"
free -h
banner "Pre-flight: current container state"
sudo docker compose -f "$COMPOSE_FILE" ps

if [[ "$DO_CHECK" -eq 1 ]]; then
  banner "Dry-run (--check): stopping before any change"
  echo "Nothing was rebuilt, restarted, or reloaded."
  exit 0
fi

# ── c. rebuild + restart the backend/workers (postgres/redis stay up) ─────
banner "Rebuild + restart (docker compose up -d --build)"
sudo docker compose -f "$COMPOSE_FILE" up -d --build

# ── e. health gate (loopback-only API) ────────────────────────────────────
banner "Health gate: polling $HEALTH_URL"
health_ok=0
health_body=""
for ((i = 1; i <= HEALTH_TRIES; i++)); do
  if health_body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
    health_ok=1
    break
  fi
  echo "  attempt $i/$HEALTH_TRIES: not ready yet, waiting ${HEALTH_SLEEP}s..."
  sleep "$HEALTH_SLEEP"
done

if [[ "$health_ok" -ne 1 ]]; then
  echo "HEALTH FAIL: $HEALTH_URL did not return OK within ~$((HEALTH_TRIES * HEALTH_SLEEP))s" >&2
  echo "last api logs:" >&2
  sudo docker compose -f "$COMPOSE_FILE" logs api --tail=40 >&2
  exit 1
fi
echo "HEALTH OK: $health_body"

# Silent-mock warning: a missing/invalid Gemini key falls back to canned analysis with only a log
# line. Surface it loudly (grep is best-effort; a miss here never fails the deploy).
if sudo docker compose -f "$COMPOSE_FILE" logs api --tail=200 2>/dev/null | grep -q 'using MockAiProvider'; then
  echo "WARNING: api logs mention 'using MockAiProvider' — GEMINI_API_KEY is missing/invalid; analyses are canned." >&2
fi

# ── f. fix static dir perms (scp'd dirs can arrive 700 -> blank screen) ────
banner "Fixing static dir perms (a+rX)"
for d in "$DIST_DIR" "$DATASETS_DIR"; do
  if [[ -d "$d" ]]; then
    chmod -R a+rX "$d"
    echo "  fixed: $d"
  else
    echo "  skip (not present): $d"
  fi
done

# ── g. nginx: validate then reload (protect the other domains) ────────────
if [[ "$DO_SKIP_NGINX" -eq 1 ]]; then
  banner "nginx: skipped (--skip-nginx)"
else
  banner "nginx: validate then reload"
  if sudo nginx -t; then
    sudo systemctl reload nginx
    echo "  nginx reloaded."
  else
    echo "error: 'nginx -t' failed — NOT reloading (other domains protected). Fix the config." >&2
    exit 1
  fi
fi

# ── d. optional prune (dangling images only; never -a, never volumes) ─────
if [[ "$DO_PRUNE" -eq 1 ]]; then
  banner "Pruning dangling images (docker image prune -f)"
  sudo docker image prune -f
fi

# ── h. final summary ───────────────────────────────────────────────────────
banner "Summary"
sudo docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "Done:"
echo "  - backend image rebuilt and api/workers restarted"
echo "  - health: OK ($HEALTH_URL)"
echo "  - static perms fixed under $DIST_DIR and $DATASETS_DIR"
if [[ "$DO_SKIP_NGINX" -eq 1 ]]; then echo "  - nginx: skipped"; else echo "  - nginx: validated and reloaded"; fi
if [[ "$DO_PRUNE" -eq 1 ]]; then echo "  - dangling images pruned"; fi
echo ""
echo "This script did NOT: build the frontend, run migrations, change .env.production,"
echo "touch other domains' nginx, or publish any new port. Those stay manual (DEPLOY_VPS §6/§7)."

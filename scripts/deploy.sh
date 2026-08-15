#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SmartSht Production Deployment Script
#
# Runs ON the server (invoked by deploy-remote.sh or manually).
# Performs: pull → install → build → deploy → health check → rollback on failure.
#
# Usage:
#   ./scripts/deploy.sh              # full deploy (frontend + server)
#   ./scripts/deploy.sh --server     # server only (skip frontend build)
#   ./scripts/deploy.sh --frontend   # frontend only (skip server restart)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

APP_DIR="/opt/smartsht/current"
SHARED_ENV="/opt/smartsht/.env"
LOGS_DIR="/opt/smartsht/logs"
FRONTEND_DEST="/var/www/smartsht/app"
PM2_PROCESS="smartsht-api"
HEALTH_URL="http://127.0.0.1:8787/health"
HEALTH_TIMEOUT=30
DEPLOY_LOG="${LOGS_DIR}/deploy.log"

# ─── Argument Parsing ─────────────────────────────────────────────────────────

DEPLOY_SERVER=true
DEPLOY_FRONTEND=true

for arg in "$@"; do
  case "$arg" in
    --server)   DEPLOY_FRONTEND=false ;;
    --frontend) DEPLOY_SERVER=false ;;
    --help|-h)
      echo "Usage: deploy.sh [--server|--frontend]"
      echo "  (no args)    Full deploy: frontend + server"
      echo "  --server     Server only: pull, build server, restart PM2"
      echo "  --frontend   Frontend only: pull, build UI, copy to www"
      exit 0
      ;;
  esac
done

# ─── Utilities ────────────────────────────────────────────────────────────────

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(timestamp)] $*" | tee -a "$DEPLOY_LOG"; }
die() { log "FATAL: $*"; exit 1; }

# ─── Pre-flight Checks ───────────────────────────────────────────────────────

log "═══ Deploy started (server=$DEPLOY_SERVER, frontend=$DEPLOY_FRONTEND) ═══"

[ -d "$APP_DIR" ] || die "App directory missing: $APP_DIR"
[ -f "$SHARED_ENV" ] || die "Shared env missing: $SHARED_ENV"
command -v node >/dev/null || die "Node.js not found"
command -v pm2 >/dev/null || die "PM2 not found"

cd "$APP_DIR"

# Record current commit for rollback
PREV_COMMIT=$(git rev-parse HEAD)
log "Current commit: ${PREV_COMMIT:0:8}"

# ─── Pull Latest Code ─────────────────────────────────────────────────────────

log "Pulling latest from origin/main..."
git fetch origin main --quiet
git reset --hard origin/main --quiet
NEW_COMMIT=$(git rev-parse HEAD)
log "Updated to: ${NEW_COMMIT:0:8}"

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  log "No changes detected — nothing to deploy."
  exit 0
fi

# Show what changed
log "Changes: $(git log --oneline "${PREV_COMMIT}..${NEW_COMMIT}" | wc -l) commit(s)"

# ─── Install Dependencies ─────────────────────────────────────────────────────

log "Installing root dependencies..."
npm ci --loglevel=warn 2>&1 | tail -3

if [ "$DEPLOY_SERVER" = true ]; then
  log "Installing server dependencies (including build tools)..."
  npm ci --prefix server --loglevel=warn 2>&1 | tail -3
fi

# ─── Sync Environment ─────────────────────────────────────────────────────────

# Server .env is maintained separately from the repo — copy shared env if newer
if [ "$SHARED_ENV" -nt "$APP_DIR/server/.env" ]; then
  log "Syncing shared .env → server/.env"
  cp "$SHARED_ENV" "$APP_DIR/server/.env"
  chmod 600 "$APP_DIR/server/.env"
fi

# ─── Build Frontend ───────────────────────────────────────────────────────────

if [ "$DEPLOY_FRONTEND" = true ]; then
  log "Building frontend (vite)..."
  npx vite build --mode production 2>&1 | tail -5

  if [ ! -f dist/index.html ]; then
    die "Frontend build failed — dist/index.html not found"
  fi

  BUNDLE_SIZE=$(du -sh dist/index.html | cut -f1)
  log "Frontend bundle: $BUNDLE_SIZE"

  log "Deploying frontend to $FRONTEND_DEST..."
  sudo cp dist/index.html "$FRONTEND_DEST/index.html"
  sudo chown www-data:www-data "$FRONTEND_DEST/index.html"

  # Copy any additional build artifacts (ONNX worker, etc.)
  for artifact in dist/*.js dist/*.css; do
    if [ -f "$artifact" ] && [ "$artifact" != "dist/index.html" ]; then
      sudo cp "$artifact" "$FRONTEND_DEST/$(basename "$artifact")"
      sudo chown www-data:www-data "$FRONTEND_DEST/$(basename "$artifact")"
    fi
  done

  # Copy any new static assets (favicon, manifest, sw.js)
  for asset in public/favicon.svg public/manifest.json public/sw.js public/apple-touch-icon.png public/robots.txt public/sitemap.xml; do
    if [ -f "$asset" ]; then
      sudo cp "$asset" "$FRONTEND_DEST/$(basename "$asset")"
      sudo chown www-data:www-data "$FRONTEND_DEST/$(basename "$asset")"
    fi
  done

  log "Frontend deployed ✓"
fi

# ─── Build & Restart Server ───────────────────────────────────────────────────

if [ "$DEPLOY_SERVER" = true ]; then
  log "Building server (tsc)..."
  npm run build --prefix server 2>&1 | tail -3

  if [ ! -f server/dist/server/src/index.js ]; then
    die "Server build failed — dist/server/src/index.js not found"
  fi

  log "Restarting PM2 process: $PM2_PROCESS..."
  pm2 restart "$PM2_PROCESS" --update-env 2>&1 | tail -3

  # ─── Health Check ─────────────────────────────────────────────────────────
  log "Waiting for health check (max ${HEALTH_TIMEOUT}s)..."
  HEALTHY=false
  for i in $(seq 1 "$HEALTH_TIMEOUT"); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      HEALTHY=true
      break
    fi
    sleep 1
  done

  if [ "$HEALTHY" = true ]; then
    log "Server healthy after ${i}s ✓"
  else
    log "HEALTH CHECK FAILED — rolling back..."
    git reset --hard "$PREV_COMMIT" --quiet
    npm ci --prefix server --loglevel=warn 2>&1 | tail -1
    npm run build --prefix server 2>&1 | tail -1
    pm2 restart "$PM2_PROCESS" --update-env 2>&1 | tail -1
    die "Deploy rolled back to ${PREV_COMMIT:0:8}. Check $LOGS_DIR/error.log"
  fi
fi

# ─── Finalize ─────────────────────────────────────────────────────────────────

log "═══ Deploy complete: ${PREV_COMMIT:0:8} → ${NEW_COMMIT:0:8} ═══"
echo ""
echo "  Frontend: https://smartsht.com/app"
echo "  API:      https://smartsht.com/api/health"
echo "  Logs:     pm2 logs smartsht-api --lines 20"
echo ""

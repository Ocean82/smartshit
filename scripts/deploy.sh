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

# If nothing changed and model assets are already present, there is nothing to do.
# Missing models should still trigger a repair pass (fresh checkout / wiped server).
MISSING_MODELS=""
if [ "$DEPLOY_SERVER" = true ] && [ ! -f server/models/minilm/model.onnx ]; then
  MISSING_MODELS="$MISSING_MODELS server-model"
fi
if [ "$DEPLOY_FRONTEND" = true ] && [ ! -f public/models/minilm/model.onnx ]; then
  MISSING_MODELS="$MISSING_MODELS client-model"
fi

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ] && [ -z "$MISSING_MODELS" ]; then
  log "No changes detected — nothing to deploy."
  exit 0
fi

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ] && [ -n "$MISSING_MODELS" ]; then
  log "No code changes, but missing:${MISSING_MODELS}. Running model repair only."
fi

# Show what changed (only when there is a real change)
if [ "$PREV_COMMIT" != "$NEW_COMMIT" ]; then
  log "Changes: $(git log --oneline "${PREV_COMMIT}..${NEW_COMMIT}" | wc -l) commit(s)"
fi

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

# ─── ONNX Model Self-Heal (non-fatal) ────────────────────────────────────────
# MiniLM ONNX assets are gitignored, so a fresh checkout (or wiped server)
# would lack them. Ensure they exist before the frontend build embeds
# public/models/ into dist/ and before the server serves Path B inference.
# Each step is non-fatal (WARN on failure) so a Hugging Face network outage
# cannot block a code deploy.

run_model_step() {
  if ! "$@" 2>&1 | tee -a "$DEPLOY_LOG" | tail -2; then
    log "WARN: model step failed (non-fatal): $*"
  fi
}

if [ "$DEPLOY_SERVER" = true ] && [ ! -f server/models/minilm/model.onnx ]; then
  log "Syncing server MiniLM model (server/models/minilm)..."
  run_model_step npm run model:copy-deploy
fi

if [ "$DEPLOY_FRONTEND" = true ] && [ ! -f public/models/minilm/model.onnx ]; then
  log "Syncing client MiniLM model (public/models/minilm, quantized)..."
  run_model_step npm run model:copy-deploy -- --public-only
fi

if [ "$DEPLOY_SERVER" = true ] && [ ! -f public/models/minilm/intent-vectors.bin ] && [ -f server/models/minilm/model.onnx ]; then
  log "Pre-computing intent vectors (public/models/minilm/intent-vectors.bin)..."
  run_model_step npm run model:precompute
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

  log "Mirroring dist/ → $FRONTEND_DEST"
  if command -v rsync >/dev/null 2>&1; then
    # Full tree mirror: index.html + app/ + assets/ + models/ + sw.js + .well-known.
    # --delay-updates stages new files and renames them at the end, shrinking the
    # window where the new index.html is live but hashed assets are still copying.
    sudo rsync -a --delete --delay-updates dist/ "$FRONTEND_DEST/"
  else
    sudo cp -rf dist/. "$FRONTEND_DEST/"
    echo "  (rsync not found — copied without pruning stale hashed assets)"
  fi
  sudo chown -R www-data:www-data "$FRONTEND_DEST"
  log "Frontend deployed ✓"
fi

# ─── Landing statics (index/terms/privacy/404/og-image/llms/robots/sitemap) ───
# Rsync the landing webroot WITHOUT --delete: /var/www/smartsht also holds app/
# and the nginx conf copy, and must never be pruned from the landing folder.
if [ -d "$APP_DIR/landing" ]; then
  log "Syncing landing statics to /var/www/smartsht..."
  if command -v rsync >/dev/null 2>&1; then
    sudo rsync -a \
      --exclude 'smartsht.nginx.conf' \
      "$APP_DIR/landing/" /var/www/smartsht/
  else
    for f in index.html terms.html privacy.html 404.html og-image.png llms.txt robots.txt sitemap.xml apple-touch-icon.png favicon.svg favicon-16x16.png favicon-32x32.png favicon-48x48.png logo.png smart-favicon.png smart-logo.png screenshot.png; do
      if [ -f "$APP_DIR/landing/$f" ]; then
        sudo cp "$APP_DIR/landing/$f" "/var/www/smartsht/$f"
      fi
    done
    echo "  (rsync not found — copied landing files individually)"
  fi
  sudo chown -R www-data:www-data /var/www/smartsht
  log "Landing statics synced ✓"
fi

# ─── Nginx (CSP, sw.js cache) ────────────────────────────────────────────────
# Always apply the repo site config. Skipping this leaves browsers on a stale
# CSP (WASM / Cloudflare Insights / Clerk CAPTCHA blocked).
if [ -f "$APP_DIR/landing/smartsht.nginx.conf" ]; then
  log "Installing nginx site config..."
  sudo cp "$APP_DIR/landing/smartsht.nginx.conf" /var/www/smartsht/smartsht.nginx.conf
  sudo cp "$APP_DIR/landing/smartsht.nginx.conf" /etc/nginx/sites-available/smartsht.com
  sudo ln -sfn /etc/nginx/sites-available/smartsht.com /etc/nginx/sites-enabled/smartsht.com
  if sudo nginx -t; then
    sudo systemctl reload nginx
    log "nginx reloaded ✓"
  else
    die "nginx -t failed — site config not reloaded"
  fi
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

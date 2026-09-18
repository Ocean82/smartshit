#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SmartSht Remote Deploy — Run from local machine
#
# This script pushes to main, then SSHs into the production server and
# executes the deploy script. It's the primary developer workflow for
# shipping changes.
#
# Usage (from project root):
#   ./scripts/deploy-remote.sh              # full deploy
#   ./scripts/deploy-remote.sh --server     # server only
#   ./scripts/deploy-remote.sh --frontend   # frontend only
#   ./scripts/deploy-remote.sh --skip-push  # deploy without pushing first
#
# Prerequisites:
#   - SSH key at ~/.ssh/server_saver_key (or set SMARTSHT_SSH_KEY)
#   - Git remote 'origin' configured
#   - Working tree clean (or stash first)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

SSH_KEY="${SMARTSHT_SSH_KEY:-$HOME/.ssh/server_saver_key}"
SSH_HOST="ubuntu@52.0.207.242"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
DEPLOY_SCRIPT="/opt/smartsht/current/scripts/deploy.sh"

# ─── Argument Parsing ─────────────────────────────────────────────────────────

SKIP_PUSH=false
DEPLOY_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --skip-push) SKIP_PUSH=true ;;
    --server|--frontend) DEPLOY_ARGS+=("$arg") ;;
    --help|-h)
      echo "Usage: deploy-remote.sh [--server|--frontend] [--skip-push]"
      exit 0
      ;;
    *)
      echo "[deploy] Unknown flag: $arg" >&2
      echo "Usage: deploy-remote.sh [--server|--frontend] [--skip-push]" >&2
      exit 1
      ;;
  esac
done

# ─── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*"; exit 1; }

# ─── Pre-flight ───────────────────────────────────────────────────────────────

info "SmartSht remote deploy starting..."

# Check SSH key exists
[ -f "$SSH_KEY" ] || error "SSH key not found: $SSH_KEY"

# Check git status
if [ -n "$(git status --porcelain)" ]; then
  warn "Working tree has uncommitted changes:"
  git status --short
  echo ""
  read -r -p "Deploy anyway? (origin/main will be deployed on the server) [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    error "Aborted — commit or stash changes first."
  fi
fi

# Ensure we're on main
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  warn "You're on branch '$BRANCH', not main."
  read -r -p "Push to main and deploy? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    error "Aborted — switch to main first."
  fi
fi

# ─── Push to Remote ──────────────────────────────────────────────────────────

if [ "$SKIP_PUSH" = true ]; then
  warn "Skipping git push (--skip-push)"
else
  info "Pushing to origin/main..."
  git push origin main --quiet 2>&1 || error "Git push failed. Resolve conflicts first."
  info "Push complete ✓"
fi

# ─── SSH Deploy ───────────────────────────────────────────────────────────────

info "Connecting to production server..."
echo ""

# shellcheck disable=SC2086
ssh $SSH_OPTS "$SSH_HOST" "bash $DEPLOY_SCRIPT ${DEPLOY_ARGS[*]-}"

STATUS=$?
echo ""

if [ $STATUS -eq 0 ]; then
  info "Deploy succeeded ✓"
else
  error "Deploy failed (exit $STATUS) — check server logs"
fi

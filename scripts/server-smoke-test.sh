#!/bin/bash
# Server smoke test — run on the production server to verify all endpoints respond correctly.
# Usage: bash scripts/server-smoke-test.sh

set -uo pipefail

PASS=0
FAIL=0
API="http://127.0.0.1:8787"

check() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $desc (HTTP $actual)"
    ((PASS++))
  else
    echo "  FAIL: $desc (expected $expected, got $actual)"
    ((FAIL++))
  fi
}

echo "=== SmartSht Server Smoke Test ==="
echo ""

# ─── Public endpoints ─────────────────────────────────────────────────────────
echo "Public endpoints:"
check "GET /health" "200" "$(curl -s -o /dev/null -w '%{http_code}' $API/health)"

# ─── Auth-required endpoints (should return 401) ──────────────────────────────
echo ""
echo "Auth-required endpoints (expect 401):"
check "GET /api/workbooks" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/api/workbooks)"
check "GET /api/health/ai" "401" "$(curl -s -o /dev/null -w '%{http_code}' $API/api/health/ai)"
check "POST /api/usage" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/usage -H 'Content-Type: application/json')"
check "POST /api/onnx/infer" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/onnx/infer -H 'Content-Type: application/json' -d '{}')"

# ─── Auth+body validation (Clerk middleware loads but body gets validated) ─────
echo ""
echo "Auth+validation endpoints (expect 401, proving Clerk runs before body parse):"

echo '{"message":"hello"}' > /tmp/smoke-chat.json
check "POST /api/chat" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/chat -H 'Content-Type: application/json' -d @/tmp/smoke-chat.json)"
check "POST /api/chat/stream" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/chat/stream -H 'Content-Type: application/json' -d @/tmp/smoke-chat.json)"

echo '{"function":"AI.CATEGORIZE","args":{"input":"coffee"}}' > /tmp/smoke-aifunc.json
check "POST /api/ai-function" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/ai-function -H 'Content-Type: application/json' -d @/tmp/smoke-aifunc.json)"

echo '{"email":"test@example.com"}' > /tmp/smoke-checkout.json
check "POST /api/checkout" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/checkout -H 'Content-Type: application/json' -d @/tmp/smoke-checkout.json)"

# ─── Stripe webhook (no auth, but requires signature) ─────────────────────────
echo ""
echo "Stripe webhook (expect 400 missing signature):"
check "POST /api/stripe/webhook" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/stripe/webhook -H 'Content-Type: application/json' -d '{}')"

# ─── Unknown routes ───────────────────────────────────────────────────────────
echo ""
echo "Unknown routes (expect 404):"
check "GET /api/nonexistent" "404" "$(curl -s -o /dev/null -w '%{http_code}' $API/api/nonexistent)"
check "GET /api/shared/bad-token" "404" "$(curl -s -o /dev/null -w '%{http_code}' $API/api/shared/bad-token)"

# ─── HTTPS via Cloudflare/nginx ───────────────────────────────────────────────
echo ""
echo "HTTPS (via Cloudflare + nginx):"
check "GET https://smartsht.com/" "200" "$(curl -s -o /dev/null -w '%{http_code}' https://smartsht.com/)"
check "GET https://smartsht.com/health" "200" "$(curl -s -o /dev/null -w '%{http_code}' https://smartsht.com/health)"
check "GET https://smartsht.com/app/" "200" "$(curl -s -o /dev/null -w '%{http_code}' https://smartsht.com/app/)"
check "GET https://smartsht.com/app/manifest.json" "200" "$(curl -s -o /dev/null -w '%{http_code}' https://smartsht.com/app/manifest.json)"
check "GET https://smartsht.com/app/pwa-icon-192.png" "200" "$(curl -s -o /dev/null -w '%{http_code}' https://smartsht.com/app/pwa-icon-192.png)"
check "GET https://smartsht.com/app/favicon.svg" "200" "$(curl -s -o /dev/null -w '%{http_code}' https://smartsht.com/app/favicon.svg)"

# ─── Mirrored dist/ tree (assets, ONNX models) ────────────────────────────────
# The /app/ location falls back to index.html (200) for missing files, so a
# bare status check can't detect a missing asset. Verify the body is a real
# asset, not the SPA document.
echo ""
echo "Frontend assets (mirrored dist tree, expect 200 + non-HTML):"

check_asset() {
  local desc="$1" url="$2"
  local tmp="/tmp/smoke-asset.bin"
  local code
  code=$(curl -s -o "$tmp" -w '%{http_code}' "$url")
  if [ "$code" = "200" ] && ! grep -aqi '<!doctype html\|<html' "${tmp}" 2>/dev/null; then
    echo "  PASS: $desc (HTTP $code, real asset)"
    ((PASS++))
  else
    echo "  FAIL: $desc (expected 200 + non-HTML, got $code)"
    ((FAIL++))
  fi
}

check_asset "GET /app/models/minilm/config.json" "https://smartsht.com/app/models/minilm/config.json"
check_asset "GET /app/models/minilm/intent-vectors.bin" "https://smartsht.com/app/models/minilm/intent-vectors.bin"

NLP_WORKER=$(ls /var/www/smartsht/app/assets/nlp.worker-*.js 2>/dev/null | head -1)
if [ -n "$NLP_WORKER" ]; then
  check_asset "GET /app/assets/$(basename "$NLP_WORKER")" "https://smartsht.com/app/assets/$(basename "$NLP_WORKER")"
else
  echo "  FAIL: nlp.worker-*.js not found in /var/www/smartsht/app/assets/"
  ((FAIL++))
fi

# WebAssembly must be served as application/wasm (nosniff + streaming compile).
ORT_WASM=$(ls /var/www/smartsht/app/assets/ort-wasm-*.wasm 2>/dev/null | head -1)
if [ -n "$ORT_WASM" ]; then
  WASM_CT=$(curl -sI "https://smartsht.com/app/assets/$(basename "$ORT_WASM")" | grep -i '^content-type:' | tr -d '\r' | awk '{print $2}')
  if [ "$WASM_CT" = "application/wasm" ]; then
    echo "  PASS: ort-wasm Content-Type = application/wasm"
    ((PASS++))
  else
    echo "  FAIL: ort-wasm Content-Type = ${WASM_CT:-<empty>} (expected application/wasm)"
    ((FAIL++))
  fi
else
  echo "  FAIL: ort-wasm-*.wasm not found in /var/www/smartsht/app/assets/"
  ((FAIL++))
fi
rm -f /tmp/smoke-asset.bin

# ─── Ollama ───────────────────────────────────────────────────────────────────
echo ""
echo "Ollama:"
OLLAMA_STATUS=$(curl -sf http://127.0.0.1:11434/api/tags 2>/dev/null && echo "reachable" || echo "unreachable")
echo "  Ollama: $OLLAMA_STATUS"
if [ "$OLLAMA_STATUS" = "reachable" ]; then
  MODEL_COUNT=$(curl -sf http://127.0.0.1:11434/api/tags | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("models",[])))' 2>/dev/null || echo "0")
  echo "  Models registered: $MODEL_COUNT"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo "  PASSED: $PASS"
echo "  FAILED: $FAIL"
echo "═══════════════════════════════════════"

rm -f /tmp/smoke-*.json
[ "$FAIL" -eq 0 ] && exit 0 || exit 1

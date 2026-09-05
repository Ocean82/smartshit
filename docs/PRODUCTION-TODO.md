# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [ ] **Deploy the committed `ecosystem.config.cjs` and start PM2 from it** — added 2026-09-05
  - Found during the 2026-09-05 deploy: `server/ecosystem.config.cjs` is committed but is **not** present at `/opt/smartsht/current/server/` on the box, and the running `smartsht-api` process was started by a manual `pm2 start` (during the Node 22 recovery), not from the ecosystem file. So the ecosystem config currently drives nothing.
  - Also: the server now runs on **Node 22** (upgraded 2026-09-05 via NodeSource, in place). `pm2 update` during that upgrade dropped the process from the dump because the ecosystem file wasn't where expected — hence the manual start + `pm2 save`.
  - Action: once a deploy checks out a tree that includes `server/ecosystem.config.cjs`, do a one-time `pm2 delete smartsht-api && pm2 start /opt/smartsht/current/server/ecosystem.config.cjs && pm2 save` so future restarts/reboots use the committed config (name, cwd, NODE_ENV, source-maps). `deploy.sh` uses `pm2 restart smartsht-api`, which reuses whatever definition exists, so this only needs doing once.

- [ ] **Suppress reasoning output on OpenRouter/HuggingFace fallbacks (Option 2)** — added 2026-09-05
  - Context: `qwen/qwen3.6-27b` is a reasoning model. On Groq we send `reasoning_effort:'none'` so it returns clean content (no `<think>` dump). On the OpenRouter/HF fallbacks (the `openaiCompatible` client) we do NOT send an equivalent, so those providers stream a reasoning phase first.
  - Already fixed (Option 1, PR #25): the client now emits one empty liveness ping on the first `delta.reasoning` chunk so the caller's 30s first-byte timeout no longer trips during reasoning. Timeouts are resolved.
  - Still TODO (polish): actually **suppress** the reasoning on these providers so fallback output matches Groq's clean output and we don't waste tokens/latency generating reasoning we discard. OpenRouter accepts `reasoning: { exclude: true }` (or `{ effort: ... }`) in the request body; HuggingFace router support varies. Plumb a provider-appropriate "no reasoning" flag through `chatWithOpenAiCompatibleStream` / `chatWithOpenAiCompatible`. Verify against each provider's live API before shipping (the param differs from Groq's `reasoning_effort`).
  - Priority: low — Groq is primary and works; this only affects the rarely-hit fallback path.

---

## Completed

- [x] **Node 20 → 22 upgrade on production** — Completed 2026-09-05
  - `package.json` engines require `>=22`; server was on Node 20.20.0. Upgraded in place via NodeSource `setup_22.x` → `apt install nodejs` (now v22.23.2). pm2 (6.0.13) and npm globals survived (prefix `/usr`). `onnxruntime-node` rebuilt cleanly against Node 22 during the deploy's `npm ci`.

- [x] **Deploy hardening PRs #22–#24 shipped to prod** — Completed 2026-09-05 (`3c52e50 → 023283b`)
  - Verified live after deploy: app online on Node 22 (0 unstable restarts); `deploy.sh` ran clean (vendored xlsx, 0 vulnerabilities, frontend WASM build, nginx `-t` + reload, server tsc build, health OK in 2s).

- [x] **`vendor/xlsx-0.20.3.tgz` present on deploy** — Confirmed 2026-09-05
  - `npm ci` resolved xlsx from the committed `file:vendor/` tarball with no CDN fetch; frontend built with the WASM engines present.

- [x] **Strict health gate (DB + S3 + Clerk) live** — Confirmed 2026-09-05
  - `GET /health?strict=1` returns **200** internally and publicly (`https://smartsht.com/health?strict=1`); DB, S3, and Clerk all healthy. Rollback-on-503 path is armed for future deploys.

- [x] **Env/model diagnostics confirmed on the live box** — Confirmed 2026-09-05
  - Boot log shows `Env: NODE_ENV=production | cwd=/opt/smartsht/current/server` and `Env file: ✓ loaded …/dist/server/.env` — that path is a **symlink → `/opt/smartsht/.env`** (the reconciled shared file), so effective config is correct: `GROQ_MODEL=qwen/qwen3.6-27b`, Clerk/DB/S3 all ✓, ONNX model resolved. The env-loading fix (#24) works; `loadEnv()` picks the symlinked compiled-dir `.env`, which resolves to the same reconciled file as `server/.env`.
  - Verified `application/wasm` gzip is live: assets serve `content-encoding: gzip` + `content-type: application/wasm` + 30d cache.

- [x] **Update `GROQ_MODEL` on production server** — Completed 2026-08-25
  - Changed to `qwen/qwen3.6-27b` (Groq's flagship replacement for deprecated llama-3.3-70b-versatile)
  - 131K context, dual-mode reasoning, json_object mode, $0.60/$3.00 per 1M tokens

- [x] **Verify Ollama is running on production server** — Verified 2026-08-25
  - `systemctl status ollama` → active
  - `ollama list` → `smartshit:latest` (2.7GB, Spreadsheet-RL-4B)
  - Model correctly built from `/opt/smartsht/models/Spreadsheet-RL-4B.Q4_K_M.gguf`

- [x] **Add OpenRouter API key to production for real failover** — Verified 2026-08-25
  - Key was already present in `/opt/smartsht/.env`
  - Updated model to `qwen/qwen3.6-27b` (same as Groq primary)
  - Base URL correctly set to `https://openrouter.ai/api/v1`

- [x] **Update `LLM_PROVIDER_ORDER` on production to include OpenRouter** — Completed 2026-08-25
  - Changed from `groq,ollama` → `groq,openrouter,ollama`
  - PM2 restarted, health check passed

# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [ ] **Suppress reasoning output on OpenRouter/HuggingFace fallbacks (Option 2)** — added 2026-09-05
  - Context: `qwen/qwen3.6-27b` is a reasoning model. On Groq we send `reasoning_effort:'none'` so it returns clean content (no `<think>` dump). On the OpenRouter/HF fallbacks (the `openaiCompatible` client) we do NOT send an equivalent, so those providers stream a reasoning phase first.
  - Already fixed (Option 1, PR #25): the client now emits one empty liveness ping on the first `delta.reasoning` chunk so the caller's 30s first-byte timeout no longer trips during reasoning. Timeouts are resolved.
  - Still TODO (polish): actually **suppress** the reasoning on these providers so fallback output matches Groq's clean output and we don't waste tokens/latency generating reasoning we discard. OpenRouter accepts `reasoning: { exclude: true }` (or `{ effort: ... }`) in the request body; HuggingFace router support varies. Plumb a provider-appropriate "no reasoning" flag through `chatWithOpenAiCompatibleStream` / `chatWithOpenAiCompatible`. Verify against each provider's live API before shipping (the param differs from Groq's `reasoning_effort`).
  - Priority: low — Groq is primary and works; this only affects the rarely-hit fallback path.

---

## Completed

- [x] **nginx broke deploy: missing Certbot HTTP-01 challenge include** — Fixed 2026-09-06
  - The 2026-09-06 launch deploy died at the `nginx -t` gate (→ `deploy.sh` rolled back) with: `open() "/etc/letsencrypt/le_http_01_cert_challenge.conf" failed (2: No such file or directory) in /etc/nginx/nginx.conf:12`.
  - Root cause: `nginx.conf` line 12 has `include /etc/letsencrypt/le_http_01_cert_challenge.conf;` (injected by Certbot's nginx installer). Certbot populates that file only during an active HTTP-01 renewal and empties it after; the file had gone missing entirely (likely a partial cleanup / tmp clearing), so the unconditional include failed and `nginx -t` failed for the **whole** config — our site config was fine (diffed identical to the repo conf).
  - Fix: recreated it empty and root-owned — `sudo touch /etc/letsencrypt/le_http_01_cert_challenge.conf && sudo chmod 644 /etc/letsencrypt/le_http_01_cert_challenge.conf && sudo chown root:root /etc/letsencrypt/le_http_01_cert_challenge.conf`. An empty file is the correct idle state and preserves Certbot auto-renewal (do **not** remove the include line — that would break the next renewal). `nginx -t` then passed and reload succeeded.
  - If this recurs after a reboot/renewal, re-run the three-command fix above (touch + chmod + chown, each with the full path). Consider a Certbot deploy-hook or a systemd tmpfiles.d entry to recreate it on boot if it keeps disappearing.

- [x] **PRs #25 (#OpenRouter reasoning timeout) + #26 (post-deploy docs) shipped to prod** — Completed 2026-09-06 (`023283b → 34cc9d5`)
  - Full launch deploy: frontend rebuilt+mirrored (6 WASM engines present), server rebuilt (tsc), PM2 restarted on Node 22.23.2, `pm2 save` persisted. Strict health gate green in 2s; public `/` 200, `/app` 301, `/health` 200. Boot log: `Env file: ✓ loaded …/dist/server/.env (35 keys)`, Groq/Clerk/DB/S3 all ✓, `GROQ_MODEL=qwen/qwen3.6-27b`. Verified the #25 reasoning-ping fix is in the fresh compiled `openaiCompatible.js`.
  - Live Groq probe against the deployed key/model: HTTP 200, content exactly `LAUNCH_OK`, no `<think>` dump — primary provider path confirmed clean end-to-end.

- [x] **~~Deploy the committed `ecosystem.config.cjs` and start PM2 from it~~ — Not applicable (corrected 2026-09-06)**
  - The earlier note assumed `server/ecosystem.config.cjs` was committed and just not deployed. It is actually **`.gitignore`d** (`.gitignore` line 49: "PM2 ecosystem config (contains server secrets)"), so it is never in the repo tree and never checked out on the box — there is nothing to migrate to.
  - The running `smartsht-api` process was started via manual `pm2 start dist/server/src/index.js --name smartsht-api --node-args="--enable-source-maps"` during the Node-22 recovery and persisted with `pm2 save`. That dump (`~/.pm2/dump.pm2`) **is** the source of truth for restarts/reboots, and `deploy.sh`'s `pm2 restart smartsht-api --update-env` reuses it correctly. This is the intended steady state — no action needed.

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

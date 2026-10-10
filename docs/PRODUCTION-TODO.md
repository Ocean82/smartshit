# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [x] **OpenRouter still pays for hidden reasoning** — done 2026-10-10
  - `reasoning: { exclude: true }` only hid the reasoning; the model still generated and billed it, and it counted against the 1024 cap.
  - Now `{ effort: "none", exclude: true }` (`server/src/openaiCompatible.ts`). Live on `qwen/qwen3.8-27b` from the box: a spreadsheet question went from 226 reasoning tokens to 0 (cost $0.00083 → $0.00022). JSON mode parsed and streaming had no reasoning deltas (first content 434 ms).

- [x] **Ollama's role on this box** — decided 2026-10-08: keep as last fallback
  - Host is 2 CPU cores, 7.6 GB RAM, no GPU. `smartshit` (Qwen3 4B Q4) took 55.6 s for a 40-token reply; the logs show "Request aborted while streaming from ollama". Expect it to time out when both cloud providers fail.

---

## Completed

- [x] **Deploy the OpenRouter `max_tokens` cap** — Deployed 2026-10-08 (`2188019`), verified 2026-10-09
  - Context: OpenRouter returned 402 ("can only afford 1056") while the app requested `max_tokens: 2048`.
  - `OPENROUTER_MAX_TOKENS` is not set in `/opt/smartsht/.env`, so the code default (1024) applies; BYOK is unaffected.
  - Verified: the error log has 30 such 402 lines, the last at 2026-10-08 15:17, none after the deploy (20:39 UTC). Groq has not failed over since, so a live streaming probe with the production key at `max_tokens: 1024` was run on the box: HTTP 200.
  - Lower the cap in `/opt/smartsht/.env` (and the GitHub `ENV` secret) if the balance keeps shrinking.

- [x] **Confirm OpenRouter `reasoning.exclude` against the live API** — Verified 2026-10-09
  - Live streaming call to `qwen/qwen3.8-27b` with the production key: HTTP 200, the field is accepted (the failover chain is safe), no `reasoning` deltas (50 without the flag), content `PROBE_OK`.
  - Token savings are small (48 vs 56 completion tokens): see the Pending item above.

- [x] **Suppress reasoning on the OpenRouter fallback (Option 2)** — Fixed 2026-09-28
  - Goal: the OpenRouter/HF fallback should produce output as clean as Groq's `reasoning_effort: 'none'`, without paying for a reasoning phase we discard.
  - **Fix:** new opt-in `suppressReasoning` on `OpenAICompatibleCallOptions`, which adds `reasoning: { exclude: true }` to the request body in both `chatWithOpenAiCompatible` and `chatWithOpenAiCompatibleStream`. Enabled at the two OpenRouter call sites in `server/src/providers.ts` (streaming + non-streaming).
  - **Deliberately NOT enabled for HuggingFace:** router support for the field is inconsistent, and an unrecognised key can fail the request outright — which would take out the fallback path this exists to protect. Also left off for BYOK (`server/src/index.ts`), where the provider is unknown by definition. Two regression tests pin the default-off behaviour so a future edit can't leak the field to an unknown provider.
  - **Not yet verified live** — see the Pending entry above. The 5 new tests assert the request body against a mocked `fetch` only.

- [x] **Parser captured the article, not the value, in `contains` conditions** — Fixed 2026-09-07 (PR #36, `007283e`)
  - Goal: `"highlight cells that contain a 4"` must set `{operator:'contains', value:'4'}` — the captured token is the *value*, never a leading article or descriptor noun.
  - **Why:** the regex allowed only one optional filler (`the` / `number` / `value` / `text`), so `"contain a 4"` captured the literal `a` and `"contain the number 4"` failed to reach the value. The condition silently matched the wrong string, so the user highlighted nothing (or the wrong cells) with no error surfaced.
  - **Fix (PR #36):** the optional filler group now repeats, over an explicit filler set (`a|an|the|any|some|each|every|number|numbers|value|values|text|digit|digits|letter|letters|char|character|characters`), so the first non-filler token is the captured value. Guarded by two regression tests in `src/agent/parser.test.ts` (plain `containing 4`, and the `the number 4` framing).

- [x] **Lazy JS chunks + WASM 404'd (dead build config) — ROOT CAUSE fix** — Fixed 2026-09-06 (PR #34, deployed `34cc9d5→69f20e5`)
  - Symptoms: `Failed to fetch dynamically imported module` 404s for every lazy chunk (`ChartDialog`, `VersionHistoryPanel`, `TemplateGallery`, `WorkbookPicker`, `intentEmbeddings`, all dialogs) and the earlier WASM `expected magic word` error — all served as `/app/<name>.js|wasm` (bare, no `assets/`) → 404 → SPA HTML → import/compile failure. Any lazy feature (dialogs, template gallery, ONNX intent classification, version history) crashed the app.
  - **Actual root cause:** `vite-plugin-singlefile` inlined the entry into `/app/index.html` and (with `deleteInlinedFiles: true`) **deleted the emitted code-split chunks** from `dist/`. But the app code-splits heavily, so the inlined bundle still contained `import('./Chunk-<hash>.js')` and `new URL('…wasm', import.meta.url)` references to files that no longer existed, resolved against the document at `/app/`. Confirmed: `dist/assets/` had only the 2 worker chunks + wasm; all ~20 lazy chunks were gone. The plugin is for apps with NO code splitting.
  - **Fix (PR #34):** removed `vite-plugin-singlefile` (+ its devDependency); Vite now emits a normal `index.html` + hashed `assets/*.js` chunks (verified: all lazy chunks present). Added `base: '/app/'` so injected URLs are `/app/assets/…` (app is served under `/app/`). De-hardcoded `/app/` on `index.html` icon/manifest links (relative to base; `/app` 301s to `/app/` so relative resolves correctly). Reverted the now-redundant nginx `/app/*.wasm` shim (PR #32) — a correct build emits proper `/app/assets/*.wasm`.
  - Verified live after deploy: entry `/app/assets/index-*.js|css` 200; every lazy chunk (ChartDialog/VersionHistoryPanel/TemplateGallery/WorkbookPicker/intentEmbeddings/CommandPalette/Pivot/Filter/Share/…) 200 `application/javascript`; formualizer wasm 200 `application/wasm`; `/app` 301, `/health?strict=1` 200; index.html is now 4K (not an inlined mega-doc). Bonus: large WASM/ONNX binaries now lazy-load instead of bloating the document (a long-standing planning-doc TODO).
  - NOTE for returning users: old hashed chunk URLs (e.g. `VersionHistoryPanel-BZttnPQz.js`) now 404 — a hard refresh / SW update is needed to pick up the new `index.html` and hashes.

- [x] **Formula engine WASM 404'd → served as HTML → compile error** — Fixed 2026-09-06 (nginx shim PR #32; superseded by PR #34 above)
  - Symptom in browser console: `WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44 4f` plus `Failed to load resource: 404` for `app/formualizer_wasm_bg-<hash>.wasm`. `3c 21 44 4f` = `<!DO` (index.html HTML).
  - Root cause: `vite-plugin-singlefile` inlines the app JS into `/app/index.html`, so the formualizer wasm-bindgen glue's `new URL('formualizer_wasm_bg-<hash>.wasm', import.meta.url)` resolves against the **document** (`/app/`) instead of `/app/assets/`, where the binaries live. `/app/<hash>.wasm` 404'd → `location /app/ { try_files … /app/index.html }` returned the SPA HTML → WASM compile failed → **formula engine dead on every fresh load.** Verified live: `/app/formualizer_wasm_bg-DEKAAUOT.wasm` 404 (text/html) vs `/app/assets/…` 200 (application/wasm).
  - Fix (PR #32, in `landing/smartsht.nginx.conf`): a regex `location ~ ^/app/([^/]+\.wasm)$` ahead of `location /app/` and the generic `\.wasm$` block, mapping bare `/app/<name>.wasm` → `/app/assets/<name>.wasm` via `try_files … =404` (clean 404, never HTML). Hashed names are unique so the remap is safe; `/app/assets/*.wasm` (with a slash) doesn't match `[^/]+` and is unaffected.
  - Applied + verified live before the repo change was merged: all 6 engine wasm files (formualizer + 4 emscripten + ort) return 200 `application/wasm` (magic `0061736d`) at the bare `/app/` path; missing wasm now returns a clean 404. Merged to `main` so it survives future deploys (`deploy.sh` reinstalls the conf).

- [x] **Certbot HTTP-01 challenge include now self-heals on boot** — Done 2026-09-06
  - The `/etc/letsencrypt/le_http_01_cert_challenge.conf` include (see item below) went missing a **second** time on 2026-09-06 and again broke `nginx -t` mid-fix. Instead of another manual `touch`, installed a durable self-heal: `/etc/tmpfiles.d/certbot-challenge-include.conf` with `f /etc/letsencrypt/le_http_01_cert_challenge.conf 0644 root root -`. `systemd-tmpfiles-setup.service` recreates the empty file on every boot, so a reboot/renewal cleanup can no longer break nginx reloads or deploys.
  - Verified: simulated `rm` of the include → `systemd-tmpfiles --create` restored it → `nginx -t` OK + reload OK. Note: this file is on the server only (not in the repo). If the box is ever rebuilt, recreate `/etc/tmpfiles.d/certbot-challenge-include.conf` with that one line.

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

- [x] **Tidy production `.env`: trim `GROQ_API_KEY`, pin `CORS_ORIGIN`** — Completed 2026-10-08
  - Removed a trailing space from `GROQ_API_KEY`; set `CORS_ORIGIN=https://smartsht.com,https://www.smartsht.com` so production no longer allows the localhost dev origins. Backups: `*.bak-tidy-*`.
  - Applied to `/opt/smartsht/.env` and `/opt/smartsht/current/server/.env`, restarted, and synced the GitHub `ENV` secret from the same file.
  - Verified: strict health 200; CORS allows both smartsht.com origins and rejects `http://localhost:5173`; Groq accepts the trimmed key.

- [x] **Remove `NODE_TLS_REJECT_UNAUTHORIZED=0` from the pm2 process** — Completed 2026-10-08
  - The override lived only in pm2's saved process env (since the 2026-09-20 RDS migration), not in `.env` or the repo. It disabled certificate checks for outbound HTTPS (Stripe, Clerk, Groq).
  - Verified first that RDS (`sslmode=require`, `rejectUnauthorized: true`), Stripe, Clerk, and Groq all pass full TLS verification without it.
  - Recreated the process without it (`pm2 start dist/server/src/index.js --name smartsht-api --node-args="--enable-source-maps" --merge-logs --time`, `NODE_ENV=production`) and ran `pm2 save`. Strict health 200; public `/` and `/health` 200. Deploys keep using `pm2 restart smartsht-api --update-env`, which does not reintroduce it.

- [x] **Move Groq and OpenRouter to `qwen/qwen3.8-27b`** — Completed 2026-10-08
  - Groq retired `qwen/qwen3.6-27b` (404 `model_not_found` on every call). Set `GROQ_MODEL` and `OPENROUTER_MODEL` to `qwen/qwen3.8-27b` in `/opt/smartsht/.env` and `/opt/smartsht/current/server/.env` (backups: `*.bak-model-20261008-*`), then `pm2 restart smartsht-api --update-env`.
  - Verified: strict health 200; a 2,048-token Groq request with `reasoning_effort: 'none'` returns clean content in 0.22 s.
  - GitHub `ENV` secret (environment `production`) re-synced from the edited `/opt/smartsht/.env` so the next deploy does not revert it. The pre-edit file's mtime matched the 2026-10-07 22:57:57 deploy sync, so only the two model lines changed.

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

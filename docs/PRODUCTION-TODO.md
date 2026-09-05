# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [ ] **Suppress reasoning output on OpenRouter/HuggingFace fallbacks (Option 2)** — added 2026-09-05
  - Context: `qwen/qwen3.6-27b` is a reasoning model. On Groq we send `reasoning_effort:'none'` so it returns clean content (no `<think>` dump). On the OpenRouter/HF fallbacks (the `openaiCompatible` client) we do NOT send an equivalent, so those providers stream a reasoning phase first.
  - Already fixed (Option 1, this PR): the client now emits one empty liveness ping on the first `delta.reasoning` chunk so the caller's 30s first-byte timeout no longer trips during reasoning. Timeouts are resolved.
  - Still TODO (polish): actually **suppress** the reasoning on these providers so fallback output matches Groq's clean output and we don't waste tokens/latency generating reasoning we discard. OpenRouter accepts `reasoning: { exclude: true }` (or `{ effort: ... }`) in the request body; HuggingFace router support varies. Plumb a provider-appropriate "no reasoning" flag through `chatWithOpenAiCompatibleStream` / `chatWithOpenAiCompatible`. Verify against each provider's live API before shipping (the param differs from Groq's `reasoning_effort`).
  - Priority: low — Groq is primary and works; this only affects the rarely-hit fallback path.

- [ ] **Ensure `vendor/xlsx-0.20.3.tgz` is present on deploy** — added 2026-09-03
  - `xlsx` is now pinned to `file:vendor/xlsx-0.20.3.tgz` (was a `cdn.sheetjs.com` URL). The tarball is committed to the repo, so a normal `git pull` / clean checkout includes it and `npm ci` resolves xlsx from that file — no network fetch to SheetJS.
  - Action: confirm the deploy path does a full checkout and does **not** filter out `vendor/` (it is not gitignored). If `npm ci` ever errors with `ENOENT`/`Cannot read` for `vendor/xlsx-0.20.3.tgz`, the vendor dir was dropped in transit — restore it before retrying.
  - To bump xlsx later: download the new official tarball into `vendor/`, verify its SHA512 matches the SheetJS release, update the `file:` path in `package.json`, and `npm install`.

- [ ] **Deploy health gate is now strict (DB + S3 + Clerk)** — added 2026-09-03
  - `deploy.sh` now checks `GET /health?strict=1`, which returns **503** (→ `curl -f` fails → automatic rollback) unless the database, S3, and Clerk are all healthy. Plain `/health` still returns 200 for liveness.
  - Action on the next deploy: ensure `DATABASE_URL`, the `S3_*`/`AWS_*` credentials, and `CLERK_SECRET_KEY` are present and reachable on the server. Production already has all three, so this should be a no-op — but if a deploy rolls back with a failed health check, read the deploy log: a 503 here means a real subsystem (DB/S3/Clerk) is down, not a false alarm. Curl `/health?strict=1` manually to see which one (`critical.{database,s3,clerk}`).
  - AI providers (Groq/OpenRouter/Ollama) and Stripe are intentionally **not** part of the gate — they degrade gracefully, so a provider/Stripe outage will not block or roll back a deploy.

- [ ] **Confirm env/model diagnostics on the live box after next deploy** — added 2026-09-03, mostly resolved in code
  - Root cause found + fixed: the **compiled** server was loading the wrong `.env`.
    `loadEnv()` resolved `<__dirname>/../.env`, which is correct for `tsx` (dev)
    but resolved to `dist/server/.env` in the compiled build — a file that does
    not exist — so **every env var silently fell back to defaults** (Clerk/DB/S3
    off, `GROQ_MODEL` defaulting). Prod only worked to the extent PM2/cwd happened
    to supply vars. `loadEnv()` now tries dev + compiled + cwd candidates and
    loads the first that exists (`server/src/loadEnv.ts`); an override is
    available via `SMARTSHT_ENV_FILE`.
  - New diagnostics (no more manual SSH to diff): the startup log now prints
    `Env: NODE_ENV=… | cwd=…` and `Env file: ✓ loaded <path> (N keys)` (or `✗ NOT
    loaded`), and the **authenticated** `GET /health` includes a `runtime` block
    (`envFile`, `cwd`, resolved model ids, `onnxModelsRoot`, `providerOrder`).
  - Action on the next deploy: read the boot log / `pm2 logs smartsht-api` and
    confirm `Env file: ✓ loaded /opt/smartsht/current/server/.env (…keys)` — NOT
    `✗ NOT loaded`. Then hit authenticated `/health` and confirm `runtime.models.groq`
    is `qwen/qwen3.6-27b` and `runtime.models.onnxModelsRoot` points at the real
    models dir (`ollama list` for the Ollama model).
  - Note: the PM2 ecosystem config sets `NODE_ENV=production` and `cwd` but does
    **not** pass `--env-file`; env loading is now owned entirely by `loadEnv()`,
    so no `--env-file` flag is needed. If a future start command adds one, make
    sure it doesn't fight `loadEnv()`.

---

## Completed

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

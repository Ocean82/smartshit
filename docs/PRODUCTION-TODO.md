# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [ ] **Ensure `vendor/xlsx-0.20.3.tgz` is present on deploy** — added 2026-09-03
  - `xlsx` is now pinned to `file:vendor/xlsx-0.20.3.tgz` (was a `cdn.sheetjs.com` URL). The tarball is committed to the repo, so a normal `git pull` / clean checkout includes it and `npm ci` resolves xlsx from that file — no network fetch to SheetJS.
  - Action: confirm the deploy path does a full checkout and does **not** filter out `vendor/` (it is not gitignored). If `npm ci` ever errors with `ENOENT`/`Cannot read` for `vendor/xlsx-0.20.3.tgz`, the vendor dir was dropped in transit — restore it before retrying.
  - To bump xlsx later: download the new official tarball into `vendor/`, verify its SHA512 matches the SheetJS release, update the `file:` path in `package.json`, and `npm install`.

- [ ] **Deploy health gate is now strict (DB + S3 + Clerk)** — added 2026-09-03
  - `deploy.sh` now checks `GET /health?strict=1`, which returns **503** (→ `curl -f` fails → automatic rollback) unless the database, S3, and Clerk are all healthy. Plain `/health` still returns 200 for liveness.
  - Action on the next deploy: ensure `DATABASE_URL`, the `S3_*`/`AWS_*` credentials, and `CLERK_SECRET_KEY` are present and reachable on the server. Production already has all three, so this should be a no-op — but if a deploy rolls back with a failed health check, read the deploy log: a 503 here means a real subsystem (DB/S3/Clerk) is down, not a false alarm. Curl `/health?strict=1` manually to see which one (`critical.{database,s3,clerk}`).
  - AI providers (Groq/OpenRouter/Ollama) and Stripe are intentionally **not** part of the gate — they degrade gracefully, so a provider/Stripe outage will not block or roll back a deploy.

- [ ] **Verify the server loads the intended `.env` and model locations** — added 2026-09-03
  - Prompted by a doc/config drift: `GROQ_MODEL` on the live server (`/opt/smartsht/.env`) was `qwen/qwen3.6-27b`, but three committed templates (`server/.env.production`, root + server `.env.example`) and the README all said `openai/gpt-oss-120b`. The templates have now been aligned, but the drift shows we don't have a reliable check that the running process reads the file/values we think it does.
  - Verify which `.env` the `smartsht-api` PM2 process actually loads (env-file flag vs. dotenv-from-cwd) and that it matches `/opt/smartsht/.env`. `pm2 env smartsht-api` did **not** surface dotenv-loaded vars, so confirm via a runtime signal (e.g. a startup log line printing the resolved `GROQ_MODEL` / model paths, or an authenticated `/health` field).
  - Confirm the model/asset locations the server resolves at runtime match what's on disk: `SMARTSHIT_MODEL` / Ollama model (`ollama list`), the ONNX/MiniLM paths under `server/models/`, and that these agree with the config the process booted with.
  - Goal: a single, non-secret runtime readout (log or health field) that states which env file and model ids/paths are in effect, so template-vs-live drift is caught on deploy instead of by manual SSH.

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

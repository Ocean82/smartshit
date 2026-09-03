# Production TODO

Running list of actions that must be performed on the production server (`ubuntu@52.0.207.242` / `/opt/smartsht/`).

Items are added as local development work creates production requirements. Check off and date when completed.

---

## Pending

- [ ] **Ensure `vendor/xlsx-0.20.3.tgz` is present on deploy** — added 2026-09-03
  - `xlsx` is now pinned to `file:vendor/xlsx-0.20.3.tgz` (was a `cdn.sheetjs.com` URL). The tarball is committed to the repo, so a normal `git pull` / clean checkout includes it and `npm ci` resolves xlsx from that file — no network fetch to SheetJS.
  - Action: confirm the deploy path does a full checkout and does **not** filter out `vendor/` (it is not gitignored). If `npm ci` ever errors with `ENOENT`/`Cannot read` for `vendor/xlsx-0.20.3.tgz`, the vendor dir was dropped in transit — restore it before retrying.
  - To bump xlsx later: download the new official tarball into `vendor/`, verify its SHA512 matches the SheetJS release, update the `file:` path in `package.json`, and `npm install`.

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

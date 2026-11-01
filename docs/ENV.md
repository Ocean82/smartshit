# Environment variables used by smartsht

See also `docs/NAMING.md` and `.env.example`.

| Var | Used by smartsht? | Notes |
|-----|-------------------|-------|
| `DATABASE_URL` | Yes | Postgres (RDS). Schema `smartsht`. |
| `S3_BUCKET`, `S3_REGION`, `S3_SMARTSHT_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Yes | Workbook/template object storage under `smartsht/` prefix |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (frontend build) | SmartSht `pk_live_*` for production builds |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Yes (server) | SmartSht instance at `clerk.smartsht.com`. Server must set `CLERK_PUBLISHABLE_KEY` (or `VITE_CLERK_PUBLISHABLE_KEY` as fallback). |
| `CLERK_AUTHORIZED_PARTIES` | Optional (server) | Comma-separated origins for JWT `azp`. Defaults to `APP_URL` + www + local Vite. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_PRICE_ID_ANNUAL`, `STRIPE_WEBHOOK_SECRET`, `APP_URL` | Yes | **SmartSht** Stripe account (`acct_1UAAnwCpwOYArhO2`), not BurntBeats. Live keys only. Canonical IDs: `scripts/smartsht-stripe-prices.env` (deploy/smoke guards). Runtime uses ENV only. Monthly: `price_1UABDhCpwOYArhO28jkA2CLX` ($7/mo). Annual: `price_1UWNq8CpwOYArhO2aIxHfshv` ($59/yr). Webhook: `https://smartsht.com/api/stripe/webhook`. Rotate prices → update that file + `/opt/smartsht/.env` + GitHub production ENV together. |
| `SMARTSHIT_MODEL`, `OLLAMA_BASE_URL`, `NUM_CTX`, `NUM_PREDICT` | Yes | Local Ollama; model id spelling is intentional. Prod uses Spreadsheet-RL-4B (8192 ctx, 1024 predict) — GGUF already on prod; verify Modelfile only |
| `SMARTSHT_MINILM_SRC` | Optional | Override source dir/file for `npm run model:copy-deploy` (MiniLM ONNX Path B). Runtime loads from `server/models/minilm/` only — never `temp/` |
| `LLM_PROVIDER_ORDER`, `GROQ_*`, `OPENROUTER_*`, `HUGGINGFACE_*` | Yes | Optional cloud LLM failover |
| `PORT`, `HOST` | Yes | Server bind |
| `TRUST_PROXY` | Yes | Express `trust proxy`. Default `loopback` (nginx on 127.0.0.1). Required for correct client IPs and rate limiting |
| `CORS_ORIGIN` | Yes | Comma-separated allowlist. Defaults to `APP_URL` + www variant + localhost dev origins. `*` opts into a public API |
| `FREE_DAILY_LIMIT` | Yes | Free-tier daily AI quota per user (default 7, persisted in Postgres) |
| `WORKBOOK_BODY_LIMIT` | Yes | Max body size for workbook save routes (default `25mb`) |
| `MAX_WORKBOOK_VERSIONS` | Yes | Versions retained per workbook before pruning from RDS + S3 (default 50) |
| `INTENT_CONFIDENCE_THRESHOLD` | Yes | Optional; default 0.6. Controls when low-confidence intents trigger clarification prompts |
| `MAX_HISTORY_CLOUD` | Yes | Optional; default 12. Max conversation history messages sent to cloud LLM providers |
| `MAX_HISTORY_LOCAL` | Yes | Optional; default 4. Max conversation history messages sent to local Ollama |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | No | Docs only — server reads `DATABASE_URL` |
| `S3_ENABLED`, `S3_PREFIX=stems`, `S3_DELETE_LOCAL_AFTER_UPLOAD` | No | Retired leftovers — do not set |

## Production infrastructure (live)

- RDS: `smartsht-db…rds.amazonaws.com`, database/role `smartsht` (not `burntbeats-db`).
- S3: `smartsht-storage-<accountId>` with prefix `smartsht/` (not `burntbeatz2-storage`).
- Secrets file on the box: **`/opt/smartsht/.env`**. GitHub Environment secret `ENV` (`production`) is the deploy source of truth and overwrites that file on every auto-deploy.

## ONNX Path B (server models)

- Authenticated `POST /api/onnx/infer` uses `onnxruntime-node` and `server/models/{name}/model.onnx` (flat `{name}.onnx` fallback).
- Populate MiniLM with `npm run model:copy-deploy` (optional `SMARTSHT_MINILM_SRC`). Download fallback needs network.
- Spreadsheet-RL-4B GGUF for Ollama chat is already on production — verify `server/Modelfile.spreadsheet-rl` only; do not re-upload.

## Production cutover checklist

1. Rebuild frontend with `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...` (SmartSht — must decode to `clerk.smartsht.com`, not `amused-mollusk`). Deploy injects `VITE_*` from `/opt/smartsht/.env`.
2. Confirm built `/var/www/smartsht/app` bundle contains **only** `pk_live_`, zero `pk_test_`.
3. Keep `/opt/smartsht/.env` and the GitHub `production` secret `ENV` in sync (prefer editing the secret, then deploy).
4. Stripe (SmartSht `acct_1UAAnwCpwOYArhO2`): `STRIPE_SECRET_KEY=sk_live_51UAAnw…`, prices `price_1UABDhCpwOYArhO28jkA2CLX` / `price_1UWNq8CpwOYArhO2aIxHfshv`, webhook `https://smartsht.com/api/stripe/webhook`. Do **not** use BurntBeats `P38C54…` price IDs.
5. After deploy: boot log `Clerk: ✓` / `Stripe: ✓`; `curl -sf http://127.0.0.1:8787/health?strict=1`.
6. Sign in on https://smartsht.com/app/ — Network tab should hit `clerk.smartsht.com`. After OAuth, land on `/app`, not `/`.
7. Nginx CSP includes `challenges.cloudflare.com` and `*.protect.clerk.com` (`landing/smartsht.nginx.conf`).
8. Cloud save sends `Authorization: Bearer …` (not `x-user-id`).
9. Spoofed `x-user-id` alone → 401.
10. **Ollama:** `ollama show smartshit` → Spreadsheet-RL-4B (already on server — do not re-upload GGUF by default).
11. **Ops:** if credentials were ever exposed in chat/logs, rotate Groq/AWS/Clerk/Stripe/DB secrets before shipping.

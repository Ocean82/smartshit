# Environment variables used by smartsht

See also `docs/NAMING.md` and `.env.example`.

| Var | Used by smartsht? | Notes |
|-----|-------------------|-------|
| `DATABASE_URL` | Yes | Postgres (RDS). Schema `smartsht`. |
| `S3_BUCKET`, `S3_REGION`, `S3_SMARTSHT_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Yes | Workbook/template object storage under `smartsht/` prefix |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (frontend build) | SmartSht `pk_live_*` for production builds |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Yes (server) | SmartSht instance at `clerk.smartsht.com`. Server must set `CLERK_PUBLISHABLE_KEY` (or `VITE_CLERK_PUBLISHABLE_KEY` as fallback). |
| `CLERK_AUTHORIZED_PARTIES` | Optional (server) | Comma-separated origins for JWT `azp`. Defaults to `APP_URL` + www + local Vite. |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `APP_URL` | Yes | Use **live** keys in production |
| `SMARTSHIT_MODEL`, `OLLAMA_BASE_URL`, `NUM_CTX`, `NUM_PREDICT` | Yes | Local Ollama; model id spelling is intentional. Prod uses Spreadsheet-RL-4B (4096 ctx, 768 predict) — GGUF already on prod; verify Modelfile only |
| `SMARTSHT_MINILM_SRC` | Optional | Override source dir/file for `npm run model:copy-deploy` (MiniLM ONNX Path B). Runtime loads from `server/models/minilm/` only — never `temp/` |
| `LLM_PROVIDER_ORDER`, `GROQ_*`, `OPENROUTER_*`, `HUGGINGFACE_*` | Yes | Optional cloud LLM failover |
| `PORT`, `HOST` | Yes | Server bind |
| `TRUST_PROXY` | Yes | Express `trust proxy`. Default `loopback` (nginx on 127.0.0.1). Required for correct client IPs and rate limiting |
| `CORS_ORIGIN` | Yes | Comma-separated allowlist. Defaults to `APP_URL` + www variant + localhost dev origins. `*` opts into a public API |
| `FREE_DAILY_LIMIT` | No | Free-tier daily AI quota per user (default 3, persisted in Postgres) |
| `WORKBOOK_BODY_LIMIT` | No | Max body size for workbook save routes (default `25mb`) |
| `MAX_WORKBOOK_VERSIONS` | No | Versions retained per workbook before pruning from RDS + S3 (default 50) |
| `INTENT_CONFIDENCE_THRESHOLD` | Yes | Optional; default 0.6 |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | No | Docs only — server reads `DATABASE_URL` |
| `S3_ENABLED`, `S3_PREFIX=stems`, `S3_DELETE_LOCAL_AFTER_UPLOAD` | No | BurntBeats leftovers |

## Shared infrastructure (OK)

- RDS host `burntbeats-db` and bucket `burntbeatz2-storage` are shared accounts.
- Isolation is via Postgres schema `smartsht` and S3 prefix `smartsht/`.

## ONNX Path B (server models)

- Authenticated `POST /api/onnx/infer` uses `onnxruntime-node` and `server/models/{name}/model.onnx` (flat `{name}.onnx` fallback).
- Populate MiniLM with `npm run model:copy-deploy` (optional `SMARTSHT_MINILM_SRC`). Download fallback needs network.
- Spreadsheet-RL-4B GGUF for Ollama chat is already on production — verify `server/Modelfile.spreadsheet-rl` only; do not re-upload.

## Production cutover checklist

1. Rebuild frontend with `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...` (SmartSht — must decode to `clerk.smartsht.com`, not `amused-mollusk`).
2. Confirm built `dist/index.html` / app bundle contains **only** `pk_live_`, zero `pk_test_`.
3. On EC2 `/home/ubuntu/smartsht/server/.env` set live Clerk + Stripe + `STRIPE_WEBHOOK_SECRET`.
4. Stripe Dashboard webhook: `https://smartsht.com/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.deleted`.
5. `pm2 restart smartsht-api` after deploying server; check boot log for `Clerk: ✓` and `Stripe: ✓`.
6. Sign in on https://smartsht.com/app/ — Network tab should hit `clerk.smartsht.com`. After OAuth, the browser must land on `/app`, not `/`.
7. Reload nginx after deploying `landing/smartsht.nginx.conf` (Clerk CAPTCHA CSP).
8. Cloud save sends `Authorization: Bearer …` (not `x-user-id`).
9. Spoofed `x-user-id` alone → 401.
10. **Ollama:** confirm `ollama show smartshit` points at Spreadsheet-RL-4B (already on server — do not re-upload GGUF by default).
11. **Ops:** if credentials were ever exposed in chat/logs, rotate Groq/AWS/Clerk/Stripe/DB secrets before shipping.

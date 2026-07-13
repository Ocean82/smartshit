# Environment variables used by smartsht

See also `docs/NAMING.md` and `.env.example`.

| Var | Used by smartsht? | Notes |
|-----|-------------------|-------|
| `DATABASE_URL` | Yes | Postgres (RDS). Schema `smartsht`. |
| `S3_BUCKET`, `S3_REGION`, `S3_SMARTSHT_PREFIX`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Yes | Workbook/template object storage under `smartsht/` prefix |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (frontend build) | SmartSht `pk_live_*` for production builds |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | Yes (server) | SmartSht instance at `clerk.smartsht.com` |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `APP_URL` | Yes | Use **live** keys in production |
| `SMARTSHIT_MODEL`, `OLLAMA_BASE_URL`, `NUM_CTX`, `NUM_PREDICT` | Yes | Local Ollama; model id spelling is intentional |
| `LLM_PROVIDER_ORDER`, `GROQ_*`, `OPENROUTER_*`, `HUGGINGFACE_*` | Yes | Optional cloud LLM failover |
| `PORT`, `HOST`, `CORS_ORIGIN` | Yes | Server bind |
| `INTENT_CONFIDENCE_THRESHOLD` | Yes | Optional; default 0.6 |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | No | Docs only — server reads `DATABASE_URL` |
| `S3_ENABLED`, `S3_PREFIX=stems`, `S3_DELETE_LOCAL_AFTER_UPLOAD` | No | BurntBeats leftovers |

## Shared infrastructure (OK)

- RDS host `burntbeats-db` and bucket `burntbeatz2-storage` are shared accounts.
- Isolation is via Postgres schema `smartsht` and S3 prefix `smartsht/`.

## Production cutover checklist

1. Rebuild frontend with `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...` (SmartSht — must decode to `clerk.smartsht.com`, not `amused-mollusk`).
2. Confirm built `dist/index.html` / app bundle contains **only** `pk_live_`, zero `pk_test_`.
3. On EC2 `/home/ubuntu/smartsht/server/.env` set live Clerk + Stripe + `STRIPE_WEBHOOK_SECRET`.
4. Stripe Dashboard webhook: `https://smartsht.com/api/stripe/webhook` for `checkout.session.completed` and `customer.subscription.deleted`.
5. `pm2 restart smartsht-api` after deploying server; check boot log for `Clerk: ✓` and `Stripe: ✓`.
6. Sign in on https://smartsht.com/app/ — Network tab should hit `clerk.smartsht.com`.
7. Cloud save sends `Authorization: Bearer …` (not `x-user-id`).
8. Spoofed `x-user-id` alone → 401.

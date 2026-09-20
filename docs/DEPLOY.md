# Production Deployment Guide

## Prerequisites

- Ubuntu/Debian server with nginx, Node.js 22+ (prod runs v22.x; `package.json` engines require `>=22`), PM2
- AWS RDS (PostgreSQL) with `smartsht` schema created
- AWS S3 bucket with `smartsht/` prefix
- Clerk account with SmartSht app (live keys)
- Stripe account with Pro product — monthly $7/mo price and annual $59/yr price (`STRIPE_PRICE_ID` + `STRIPE_PRICE_ID_ANNUAL`)
- Groq API key (free tier is sufficient for launch)
- Domain: smartsht.com pointing to server IP
- Let's Encrypt SSL certificate (certbot)

---

## 1. Environment Setup

### Frontend build environment (`.env.production` at project root)

The Vite build bakes `VITE_*` variables into the JavaScript bundle at compile time. These must be set **before** running `npm run build`.

```bash
# Create .env.production at the project root (NOT in server/)
cat > .env.production << 'EOF'
VITE_CLERK_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_CLERK_KEY
VITE_AI_API_URL=
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
VITE_APP_VERSION=1.0.0
EOF
```

**Important:** `VITE_AI_API_URL` should be empty for production — the app uses same-origin `/api` requests which nginx proxies to the Express server.

### Server runtime environment (`server/.env`)

Copy `server/.env.production` to `server/.env` on the production server and fill in real values:

```bash
cp server/.env.production server/.env
# Edit with real secrets:
nano server/.env
```

Required keys for Clerk + Stripe to work:
- `CLERK_SECRET_KEY` — live secret key from Clerk dashboard
- `CLERK_PUBLISHABLE_KEY` — live publishable key
- `STRIPE_SECRET_KEY` — live secret key from Stripe dashboard
- `STRIPE_PRICE_ID` — the $7/mo Pro price ID
- `STRIPE_WEBHOOK_SECRET` — from the webhook endpoint in Stripe dashboard
- `APP_URL=https://smartsht.com`
- `TRUST_PROXY=loopback`

---

## 2. Build for Production

```bash
# From project root on your local machine (or CI):

# Install dependencies
npm ci
npm ci --prefix server

# Build frontend (bakes in VITE_CLERK_PUBLISHABLE_KEY from .env.production)
npm run build

# Build server
npm run build:server

# Verify
ls dist/index.html                      # SPA shell (JS/CSS inlined)
ls dist/assets/*.wasm                    # Formula/ONNX engines (external, required)
ls server/dist/server/src/index.js       # Compiled server entrypoint (tsc preserves the server/src/ path)
```

The frontend build inlines all JS and CSS into `dist/index.html` (via
vite-plugin-singlefile), but the WebAssembly engines are **not** inlined — the
build emits several external `.wasm` binaries plus worker bundles under
`dist/assets/` (the formualizer engine ~8.6MB and the ONNX runtime ~27MB are the
large ones). The whole `dist/` tree must be deployed together; copying only
`index.html` will 404 the engines and the app will fail to load formulas.

---

## 3. Deploy to Server

### Automated deployment (recommended)

**Preferred:** GitHub Actions workflow [`Deploy`](../.github/workflows/deploy.yml) — syncs the `production` Environment secret `ENV` to `/opt/smartsht/.env`, SSHs in, and runs `scripts/deploy.sh` (same logic as local).

| Trigger | Behavior |
|---------|----------|
| Actions → **Deploy** → Run workflow | Manual; choose `full` / `server` / `frontend`; optional env sync |
| Push to `main` after **CI** succeeds | Full deploy + env sync (not PR CI, not the weekly schedule job) |

**Required Environment secrets** (`Settings → Environments → production`)

| Name | Value |
|------|--------|
| `ENV` | Entire contents of `/opt/smartsht/.env` as one multiline secret |
| `SSH_PRIVATE_KEY` | Private key for `ssh ubuntu@52.0.207.242` (same material as `~/.ssh/server_saver_key`) |

Optional Environment **variable**: `SSH_HOST` (default `ubuntu@52.0.207.242`).

After Actions is in use, treat the GitHub `ENV` secret as the secrets source of truth for deploys (each sync overwrites `/opt/smartsht/.env` and keeps a `.env.bak-gha-*` backup). Update that secret whenever production config changes.

**Local fallback** (Windows):
```powershell
npm run deploy              # full
npm run deploy:server       # server only
npm run deploy:frontend     # frontend only
```

**Local fallback** (bash / Git Bash / WSL / macOS):
```bash
./scripts/deploy-remote.sh              # full deploy
./scripts/deploy-remote.sh --server     # server only
./scripts/deploy-remote.sh --frontend   # frontend only
```

### What deploy.sh does (on the server)

Invoked by Actions or `deploy-remote.sh`:

1. `git fetch` + `git reset --hard origin/main`
2. `npm ci` at root and in `server/` (full install — **not** `--omit=dev`)
3. Syncs shared `/opt/smartsht/.env` → `server/.env` if newer
4. Self-heals MiniLM ONNX models / intent vectors if needed
5. Builds frontend → mirrors `dist/` to `/var/www/smartsht/app/` (fails → rollback if no `.wasm`)
6. Installs nginx conf, `nginx -t`, reload
7. Builds server (`tsc`) → `pm2 restart smartsht-api --update-env`
8. Strict health check `http://127.0.0.1:8787/health?strict=1` (DB + S3 + Clerk); rollback on failure

### Server directory layout

```
/opt/smartsht/
├── .env                # Shared secrets (never in git; Actions can sync from secret ENV)
├── current/            # Git clone of main branch
│   ├── dist/           # Frontend build output
│   ├── server/
│   │   ├── dist/server/src/index.js  # Compiled server entrypoint (PM2 runs this)
│   │   ├── .env        # Copied from /opt/smartsht/.env
│   │   └── dist/server/.env  # Symlink → /opt/smartsht/.env (what loadEnv finds first)
│   │   # NOTE: server/ecosystem.config.cjs is GITIGNORED — NOT present on the box. PM2 is driven by the saved dump (see §5).
│   └── scripts/
│       └── deploy.sh   # Server-side deploy logic
├── logs/               # PM2 error.log + out.log + deploy.log
└── models/             # Ollama GGUF (Spreadsheet-RL-4B, 2.7GB)

/var/www/smartsht/
├── index.html          # Landing page
├── app/
│   ├── index.html      # SPA shell
│   ├── assets/         # .wasm engines + worker bundles
│   └── sw.js           # Service worker
├── terms.html
├── privacy.html
└── (static assets)
```

### Manual deployment (escape hatch)

```bash
ssh -i ~/.ssh/server_saver_key ubuntu@52.0.207.242
cd /opt/smartsht/current
git fetch origin main && git reset --hard origin/main
# Full install (NOT --omit=dev): tsc/vite build tools live in devDependencies.
npm ci
npm ci --prefix server
npx vite build
# Mirror the WHOLE dist/ tree — index.html AND assets/ (.wasm engines + workers).
# Copying only index.html 404s the engines. --delete prunes stale hashed assets.
sudo rsync -a --delete dist/ /var/www/smartsht/app/
npm run build --prefix server
pm2 restart smartsht-api --update-env
# Strict readiness (503 unless DB+S3+Clerk healthy) — same gate deploy.sh uses:
curl -sf 'http://127.0.0.1:8787/health?strict=1'
```

---

## 4. Nginx Configuration

Copy `landing/smartsht.nginx.conf` to nginx:

```bash
sudo cp /var/www/smartsht/smartsht.nginx.conf /etc/nginx/sites-available/smartsht.com
sudo ln -sf /etc/nginx/sites-available/smartsht.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> **Gotcha — Certbot HTTP-01 challenge include (broke a deploy 2026-09-06):**
> The system `nginx.conf` includes `/etc/letsencrypt/le_http_01_cert_challenge.conf`
> (injected by Certbot's nginx installer). Certbot only populates that file during
> an active HTTP-01 renewal and empties it afterward — but if the file goes missing
> entirely, `nginx -t` fails for the **whole** config (`open() ... failed (2: No such
> file or directory)`), which aborts the deploy even when the site config is fine.
> Fix by recreating it empty and root-owned (do **not** delete the include line — that
> breaks the next renewal):
> ```bash
> sudo touch /etc/letsencrypt/le_http_01_cert_challenge.conf && \
> sudo chmod 644 /etc/letsencrypt/le_http_01_cert_challenge.conf && \
> sudo chown root:root /etc/letsencrypt/le_http_01_cert_challenge.conf
> ```

The nginx config handles:
- HTTPS with Let's Encrypt
- HTTP → HTTPS redirect
- `/api/` proxy to Express on port 8787
- `/app/` serves the SPA with fallback to `index.html`
- `/terms` and `/privacy` serve legal pages
- `/shared/` routes to the SPA for shared workbook views
- Exact-match `/llms.txt`, `/robots.txt`, and `/sitemap.xml` (plain text / XML — do not fall through to SPA)
- Security headers (HSTS, CSP, X-Frame-Options, etc.)
- Gzip compression
- Static asset caching (30 days)

After copying `landing/*`, confirm `https://smartsht.com/llms.txt` returns `text/plain` (not the HTML homepage).

---

## 5. Start the Server

```bash
# Using PM2 for process management. Run from the server package dir so the
# process cwd resolves models/ and the .env correctly.
cd /opt/smartsht/current/server

# The compiled entrypoint is nested under dist/server/src/ (tsc preserves the
# source layout). loadEnv() locates the .env itself (dev/compiled/cwd candidates),
# so no --env-file flag is needed.
pm2 start dist/server/src/index.js --name smartsht-api --node-args="--enable-source-maps"

# Save PM2 config for auto-restart on reboot
pm2 save
pm2 startup
```

> **PM2 source of truth:** `ecosystem.config.cjs` is **gitignored** (it can hold
> secrets), so it is never checked out on the server — there is nothing to start
> "from the ecosystem file." The running process is defined by the manual
> `pm2 start` above and persisted with `pm2 save` (`~/.pm2/dump.pm2`). `deploy.sh`'s
> `pm2 restart smartsht-api --update-env` reuses that saved definition. This is the
> intended steady state.

> **⚠️ Run a single instance only — do NOT use PM2 cluster mode.** The `pm2 start`
> above launches exactly one process (fork mode), which is required. Several pieces
> of server state live in-process and are **not** shared across workers:
> - `express-rate-limit` uses the in-memory `MemoryStore` — N workers would each
>   allow the full quota, multiplying effective rate limits by N.
> - the provider **circuit breaker** state (`providers.ts`) — one worker's open
>   breaker wouldn't stop the others from hammering a failing provider.
> - the Pro-plan cache (`proCache`), experimental-function burst counters
>   (`experimentalBursts`), and the `memoryUsage` fallback counter (used only when
>   `DATABASE_URL` is unset) — all per-process, so they fragment under clustering.
>
> Usage metering itself is safe under clustering (it was migrated to Postgres), but
> the items above are not. **Do not** run `pm2 scale`, set `instances > 1`, or add
> `exec_mode: 'cluster'` in any local `ecosystem.config.cjs`. If you need to scale
> beyond one process, first move the rate limiter to a shared store (e.g. Redis via
> `rate-limit-redis`) and externalize the circuit-breaker/cache state.

---

## 6. Verify Production

```bash
# Health check
curl https://smartsht.com/health

# Expected response:
# { "ok": true, "port": 8787, "providers": [...], "database": "connected", ... }

# Verify Clerk is working (should return 401, not 500)
curl -s https://smartsht.com/api/usage -X POST | jq .

# Verify Stripe webhook endpoint
curl -s https://smartsht.com/api/stripe/webhook -X POST
# Should return 400 (bad signature), not 404 or 500
```

---

## 7. Stripe Webhook Setup

In the Stripe dashboard:
1. Go to Developers → Webhooks
2. Add endpoint: `https://smartsht.com/api/stripe/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the signing secret → put in `STRIPE_WEBHOOK_SECRET` in server/.env
5. Restart PM2: `pm2 restart smartsht-api`

---

## 8. Clerk Dashboard (required for sign-in / sign-up)

Sign-in does **not** use a Clerk webhook. Stripe already updates Clerk `publicMetadata.plan`.

In the Clerk dashboard for the SmartSht instance (`clerk.smartsht.com`):

1. Paths → after sign-in / after sign-up / home URL: `https://smartsht.com/app`
2. Allowed origins: `https://smartsht.com`, `https://www.smartsht.com`
3. Production keys: `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` on the server; rebuild the SPA with `VITE_CLERK_PUBLISHABLE_KEY`
4. After deploying nginx, reload it so CSP includes `challenges.cloudflare.com` and `*.protect.clerk.com` (see `landing/smartsht.nginx.conf`)

Optional: `user.created` webhooks are not implemented; `smartsht.users` is upserted on first cloud save.

---

## 9. Database Schema

Ensure the `smartsht` schema exists in your RDS database:

```sql
CREATE SCHEMA IF NOT EXISTS smartsht;

CREATE TABLE IF NOT EXISTS smartsht.workbooks (
  id UUID PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled',
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smartsht.workbook_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smartsht.shared_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  permission TEXT NOT NULL DEFAULT 'view',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smartsht.ai_usage_daily (
  user_id TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_workbooks_owner ON smartsht.workbooks(owner_id);
CREATE INDEX IF NOT EXISTS idx_versions_workbook ON smartsht.workbook_versions(workbook_id);
CREATE INDEX IF NOT EXISTS idx_shared_token ON smartsht.shared_links(token);
CREATE INDEX IF NOT EXISTS idx_usage_date ON smartsht.ai_usage_daily(usage_date);
```

---

## 10. Production Checklist

| Item | Command / Check |
|------|----------------|
| Frontend builds | `npm run build` succeeds |
| Server builds | `npm run build:server` succeeds |
| All tests pass | `npm test` + `npm test --prefix server` |
| Release gates | `npm run release:check:v1` |
| Ollama model correct | `ollama create smartshit -f server/Modelfile.spreadsheet-rl` (Spreadsheet-RL-4B) |
| HTTPS works | `curl -I https://smartsht.com` → 200 |
| Health endpoint | `curl https://smartsht.com/health` → ok; `curl -sf https://smartsht.com/health?strict=1` → 200 (DB+S3+Clerk up) |
| Clerk auth | Sign in works, JWT verified |
| Free limit | 8th question of the day shows upgrade prompt (`FREE_DAILY_LIMIT=7`) |
| Stripe checkout | Upgrade button → Stripe hosted page |
| Stripe webhook | Payment → user metadata updated → unlimited |
| Cloud save | Save workbook → appears in RDS + S3 |
| Share link | Generate → recipient can view (read-only only) |

---

## Environment Variable Flow

```
┌─────────────────────────────────────────────────────────┐
│  BUILD TIME (Vite)                                       │
│  .env.production (root) → baked into dist/index.html     │
│  • VITE_CLERK_PUBLISHABLE_KEY (Clerk frontend auth)      │
│  • VITE_AI_API_URL (empty = same-origin)                 │
│  • VITE_SENTRY_DSN (error reporting)                     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  RUNTIME (Express server)                                │
│  server/.env → loaded by dotenv at startup               │
│  • CLERK_SECRET_KEY (verify JWTs server-side)            │
│  • STRIPE_SECRET_KEY (create checkout sessions)          │
│  • STRIPE_WEBHOOK_SECRET (verify webhook signatures)     │
│  • DATABASE_URL (usage tracking, workbook storage)       │
│  • GROQ_API_KEY (LLM inference)                          │
│  • AWS credentials (S3 workbook storage)                 │
│  • APP_URL (CORS, redirect URLs)                         │
│  • TRUST_PROXY (correct client IP for rate limiting)     │
└─────────────────────────────────────────────────────────┘
```

**Key distinction:** Frontend Clerk key is the *publishable* key (safe to expose in client JS). Server Clerk key is the *secret* key (never exposed, verifies JWTs). Both must be from the same Clerk app instance, and both must be LIVE keys for production (not test keys).

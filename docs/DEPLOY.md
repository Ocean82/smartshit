# Production Deployment Guide

## Prerequisites

- Ubuntu/Debian server with nginx, Node.js 20+, PM2
- AWS RDS (PostgreSQL) with `smartsht` schema created
- AWS S3 bucket with `smartsht/` prefix
- Clerk account with SmartSht app (live keys)
- Stripe account with Pro product + $7/mo price created
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
ls dist/index.html          # Frontend SPA (single file)
ls server/dist/index.js     # Compiled server
```

The frontend build produces a single `dist/index.html` file (via vite-plugin-singlefile) that contains all JS and CSS inlined.

---

## 3. Deploy to Server

```bash
# On the production server:

# Create app directory
sudo mkdir -p /var/www/smartsht/app
sudo mkdir -p /var/www/smartsht/server

# Copy frontend
scp dist/index.html server:/var/www/smartsht/app/index.html

# Copy landing page
scp -r landing/* server:/var/www/smartsht/

# Copy server
scp -r server/dist/* server:/var/www/smartsht/server/
scp server/package.json server/package-lock.json server:/var/www/smartsht/server/
scp server/.env server:/var/www/smartsht/server/.env

# Install server production dependencies
cd /var/www/smartsht/server && npm ci --production

# Copy public assets (favicons, manifest, sw.js) to app directory
scp -r public/* server:/var/www/smartsht/app/
```

---

## 4. Nginx Configuration

Copy `landing/smartsht.nginx.conf` to nginx:

```bash
sudo cp /var/www/smartsht/smartsht.nginx.conf /etc/nginx/sites-available/smartsht.com
sudo ln -sf /etc/nginx/sites-available/smartsht.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The nginx config handles:
- HTTPS with Let's Encrypt
- HTTP → HTTPS redirect
- `/api/` proxy to Express on port 8787
- `/app/` serves the SPA with fallback to `index.html`
- `/terms` and `/privacy` serve legal pages
- `/shared/` routes to the SPA for shared workbook views
- Security headers (HSTS, CSP, X-Frame-Options, etc.)
- Gzip compression
- Static asset caching (30 days)

---

## 5. Start the Server

```bash
# Using PM2 for process management
cd /var/www/smartsht/server
pm2 start dist/index.js --name smartsht-api --node-args="--env-file=.env"

# Or without --env-file (dotenv loads .env from server/ directory):
pm2 start dist/index.js --name smartsht-api

# Save PM2 config for auto-restart on reboot
pm2 save
pm2 startup
```

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

## 8. Clerk Webhook Setup (Optional — for real-time plan sync)

If you want Clerk to know about Stripe plan changes immediately:
1. In Clerk dashboard → Webhooks → Add endpoint
2. URL: `https://smartsht.com/api/clerk/webhook` (if implemented)
3. Or: the Stripe webhook handler already calls Clerk Backend API to update user publicMetadata with `plan: 'pro'`

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
| Health endpoint | `curl https://smartsht.com/health` → ok |
| Clerk auth | Sign in works, JWT verified |
| Free limit | 4th question shows upgrade prompt |
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

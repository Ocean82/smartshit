# Auth, Env, and Naming Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production smartsh!t authenticate against the **SmartSht** Clerk instance (`clerk.smartsht.com`), pass verified identity into every protected API, load env secrets reliably, fix Stripe/webhook → Pro metadata, and eliminate naming drift that confuses keys, routes, and deploy config.

**Architecture:** Client gets a Clerk session JWT via `getToken()` and sends `Authorization: Bearer <jwt>`. Express uses `@clerk/express` (`clerkMiddleware` + `getAuth`) with JWT verification against the SmartSht Frontend API (`https://clerk.smartsht.com`, JWKS at `https://clerk.smartsht.com/.well-known/jwks.json`). Spoofable `x-user-id` headers are removed. Stripe webhooks update Clerk `publicMetadata.plan` via `@clerk/backend`. Env loading moves to an explicit `dotenv` load of `/home/ubuntu/smartsht/server/.env` (and local `.env`) so PM2 and file secrets stay in sync. Naming follows a single canon (below).

**Tech Stack:** Vite + React (`@clerk/react`), Express 5 (`@clerk/express`, `@clerk/backend`), Stripe REST + HMAC webhooks, PM2 on EC2, Postgres schema `smartsht`, S3 prefix `smartsht/`

---

## PRE-BUILD REALITY CHECK (locked for this plan)

```text
PRE-BUILD REALITY CHECK

✅ Goal:
Secure production auth + billing identity, and stop naming/env drift from breaking deploy.

✅ Proposed approach:
Clerk JWT middleware + client getToken(), env/dotenv + PM2, Stripe live webhook → Clerk metadata, naming canon.

✅ Feasibility:
Feasible. Stack already has Clerk client + Express routes; missing pieces are wiring and keys.

✅ Requirements:
SmartSht Clerk pk_live + sk_live, Stripe live keys + webhook secret, CLERK_SECRET_KEY on server, rebuild SPA with VITE_CLERK_PUBLISHABLE_KEY.

⚠️ Risks:
Wrong Clerk instance (BurntBeats/test amused-mollusk) already deployed; renaming localStorage keys can wipe UX state if migration is skipped; Stripe test→live breaks unfinished test subscriptions.

❌ Problems with the current approach:
No JWT validation; setUserId never called; sk_test + missing STRIPE_WEBHOOK_SECRET; pk_test in prod bundle; server .env not loaded (no dotenv).

🔄 Better alternatives:
1) @clerk/express middleware (recommended) vs hand-rolled JWKS verify
2) Keep SMARTSHIT_MODEL as intentional Ollama ID (recommended) vs rename model now
3) Single plan with phases (this doc) vs three separate plans (acceptable later split)

✅ Recommendation:
Execute this plan in order: naming canon → env → Clerk JWT → client wiring → Stripe → deploy verify.

FINAL STATUS:
SAFE TO PROCEED (after confirming live Stripe + Clerk secrets are available at implement time)
```

---

## Naming Canon (non-negotiable)

| Layer | Canonical value | Notes |
|-------|-----------------|-------|
| **Brand / UI copy** | `smartsh!t` | Titles, chat persona, WelcomeOverlay, App chrome |
| **Public domain** | `smartsht.com` | Never put `!` in hostnames, emails, APP_URL |
| **Clerk Frontend API** | `https://clerk.smartsht.com` | SmartSht instance only; JWKS: `/.well-known/jwks.json` |
| **Clerk Backend API** | `https://api.clerk.com` | Via `@clerk/backend` / `@clerk/express` with SmartSht `CLERK_SECRET_KEY` |
| **Technical IDs (no `!`)** | `smartsht` | DB schema, S3 prefix, localStorage keys (new), event names, npm-safe short ids |
| **Ollama model name** | `smartshit` | **Keep** — already registered on EC2 via `ollama create smartshit`; env `SMARTSHIT_MODEL` |
| **GitHub repo** | `Ocean82/smartshit` | Out of scope to rename; document as legacy repo slug |
| **Forbidden in prod** | `pk_test_*`, `amused-mollusk`, BurntBeats Clerk instance | Production must use SmartSht `pk_live_*` |

**Spelling rules for implementers:**
- User-facing: always `smartsh!t` (with bang) except where HTML title already matches domain branding on the **landing** page (see Task 1 — unify landing to brand).
- Code identifiers / env / paths: prefer `smartsht` over `smartshit` except Ollama model + existing `SMARTSHIT_*` env names.
- Do not invent a fourth spelling (`SmartSheet`, `smart-shit`, etc.) in new code.

---

## File map

| File | Responsibility |
|------|----------------|
| `docs/NAMING.md` | Canon reference for humans |
| `src/env.d.ts` | Correct `VITE_*` typings |
| `.env.example` | Document all real vars (Clerk, Stripe, DB, S3) |
| `server/src/config.ts` | Add Clerk + dotenv-loaded secrets |
| `server/src/loadEnv.ts` | Load `.env` before config |
| `server/src/auth/clerk.ts` | Auth helpers: requireUserId, isProFromAuth |
| `server/src/index.ts` | clerkMiddleware, protect routes, webhook → Clerk |
| `server/src/routes/{workbooks,shares,versions,templates}.ts` | Replace getUserId header spoof with getAuth |
| `server/src/stripe.ts` | Unchanged verify; callers update Clerk |
| `src/lib/cloudSync.ts` | Bearer token auth; setUserId from Clerk |
| `src/auth/ClerkUserSync.tsx` | On sign-in: setUserId + token provider |
| `src/auth/AuthProvider.tsx` | Keep SmartSht publishable key |
| `src/ai/agentClient.ts` | Send Authorization + no client isPro trust |
| `src/components/ChatPanel.tsx` | Mount UpgradePrompt / usage |
| `src/components/MenuBar.tsx` or `App.tsx` | Mount UserNav |
| `server/ecosystem.config.cjs` | Document that secrets come from `.env` via dotenv |
| localStorage migration helpers | `smartshit-*` → `smartsht-*` with fallback read |

---

## Phase A — Naming canon and config surface

### Task 1: Document naming canon + fix user-facing brand drift

**Files:**
- Create: `docs/NAMING.md`
- Modify: `landing/index.html` (title/OG currently say `smartsht` without bang)
- Modify: `index.html` (already `smartsh!t` — keep)
- Modify: `public/manifest.json` (name already correct)

- [ ] **Step 1: Create `docs/NAMING.md`** with the Naming Canon table from this plan (copy the table above verbatim).

- [ ] **Step 2: Align landing brand to UI brand**

In `landing/index.html`, change visible product name in `<title>`, `og:title`, `twitter:title`, and footer from `smartsht` to `smartsh!t` while keeping URLs as `https://smartsht.com`.

Example title:
```html
<title>smartsh!t — Talk to Your Spreadsheet</title>
```

- [ ] **Step 3: Commit**

```bash
git add docs/NAMING.md landing/index.html
git commit -m "docs: add naming canon and align landing brand to smartsh!t"
```

---

### Task 2: Fix env typings and `.env.example`

**Files:**
- Modify: `src/env.d.ts`
- Modify: `.env.example`
- Modify: `server/src/config.ts` (Clerk keys only — loading in Task 3)

- [ ] **Step 1: Replace `src/env.d.ts` with names the code actually uses**

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_AI_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 2: Expand `.env.example`**

Append (keep existing LLM/DB/S3 block; add):

```bash
# Frontend (baked at Vite build time — use SmartSht LIVE keys for production builds)
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
# Optional; empty = same-origin /api via nginx or Vite proxy
VITE_AI_API_URL=

# Clerk Backend (SmartSht instance — clerk.smartsht.com / api.clerk.com)
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
# Optional override if JWT issuer must be forced:
# CLERK_AUTHORIZED_PARTIES=https://smartsht.com,https://www.smartsht.com

# Stripe (LIVE for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://smartsht.com

# Ollama model id (intentional spelling — do not rename without recreating the model)
SMARTSHIT_MODEL=smartshit
```

Remove or comment BurntBeats-only vars (`S3_ENABLED`, `S3_PREFIX=stems`, `S3_DELETE_LOCAL_AFTER_UPLOAD`, `DB_HOST`/`DB_PORT`/…) as “not used by smartsht server — only DATABASE_URL + S3_SMARTSHT_PREFIX”.

- [ ] **Step 3: Add Clerk fields to `server/src/config.ts`**

```typescript
  // Clerk (SmartSht — https://clerk.smartsht.com)
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',
```

- [ ] **Step 4: Commit**

```bash
git add src/env.d.ts .env.example server/src/config.ts
git commit -m "chore: align env typings and document Clerk/Stripe production vars"
```

---

### Task 3: Load server `.env` reliably (dotenv)

**Why:** Production `/home/ubuntu/smartsht/server/.env` exists but is **not loaded** — no dotenv dependency; PM2 env is the only source of truth and has drifted (test Stripe, no webhook secret, no Clerk).

**Files:**
- Create: `server/src/loadEnv.ts`
- Modify: `server/src/index.ts` (import loadEnv first)
- Modify: `server/package.json` (add `dotenv`)
- Modify: `server/ecosystem.config.cjs` (comment + keep non-secrets)

- [ ] **Step 1: Install dotenv in server**

```bash
cd server && npm install dotenv
```

- [ ] **Step 2: Create `server/src/loadEnv.ts`**

```typescript
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(__dirname, '..')

export function loadEnv(): void {
  dotenv.config({ path: path.join(serverRoot, '.env') })
}
```

- [ ] **Step 3: Import at the very top of `server/src/index.ts`**

```typescript
import { loadEnv } from './loadEnv.js'
loadEnv()
```

Must run **before** `import { config } from './config.js'` — if ESM hoisting makes that hard, switch to:

```typescript
import { loadEnv } from './loadEnv.js'
loadEnv()
const { config } = await import('./config.js')
```

Preferred pattern for this codebase: make `config.ts` call `loadEnv()` once at module top:

```typescript
// server/src/config.ts — first lines
import { loadEnv } from './loadEnv.js'
loadEnv()
```

- [ ] **Step 4: Smoke test locally**

```bash
cd server
# ensure .env has PORT=8787
npx tsx -e "import { config } from './src/config.ts'; console.log(Boolean(config.databaseUrl), config.port)"
```

Expected: prints `true 8787` (or false if no local DB — still prints port).

- [ ] **Step 5: Commit**

```bash
git add server/src/loadEnv.ts server/src/config.ts server/package.json server/package-lock.json server/ecosystem.config.cjs
git commit -m "fix: load server .env via dotenv so PM2 and file secrets stay aligned"
```

---

## Phase B — Clerk JWT middleware (SmartSht instance)

### Task 4: Add `@clerk/express` and requireAuth helper

**Clerk instance proof:** JWKS at [https://clerk.smartsht.com/.well-known/jwks.json](https://clerk.smartsht.com/.well-known/jwks.json) (kid `ins_3GD35PjRVwN0sPXnIESHkVRENHa`). Production must use keys for **this** instance, not BurntBeats/`amused-mollusk`.

**Files:**
- Create: `server/src/auth/clerk.ts`
- Create: `server/src/auth/clerk.test.ts`
- Modify: `server/package.json`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Install**

```bash
cd server && npm install @clerk/express @clerk/backend
```

- [ ] **Step 2: Write failing unit test for helper that extracts userId**

Create `server/src/auth/clerk.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { planFromPublicMetadata } from './clerk.js'

describe('planFromPublicMetadata', () => {
  it('returns pro when plan is pro', () => {
    expect(planFromPublicMetadata({ plan: 'pro' })).toBe('pro')
  })
  it('returns pro when stripeSubscriptionId present', () => {
    expect(planFromPublicMetadata({ stripeSubscriptionId: 'sub_x' })).toBe('pro')
  })
  it('returns free otherwise', () => {
    expect(planFromPublicMetadata({})).toBe('free')
    expect(planFromPublicMetadata(undefined)).toBe('free')
  })
})
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
cd server && npm test -- src/auth/clerk.test.ts
```

Expected: FAIL — module/export missing.

- [ ] **Step 4: Implement `server/src/auth/clerk.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express'
import { getAuth } from '@clerk/express'
import { createClerkClient } from '@clerk/backend'
import { config } from '../config.js'

export type Plan = 'free' | 'pro'

export function planFromPublicMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Plan {
  if (!metadata) return 'free'
  if (metadata.plan === 'pro' || metadata.stripeSubscriptionId) return 'pro'
  return 'free'
}

export function getClerkClient() {
  if (!config.clerkSecretKey) {
    throw new Error('CLERK_SECRET_KEY not configured (SmartSht instance required)')
  }
  return createClerkClient({ secretKey: config.clerkSecretKey })
}

/** Express middleware: 401 unless Clerk session JWT is valid. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req)
  if (!auth.isAuthenticated || !auth.userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  next()
}

export function getRequestUserId(req: Request): string | null {
  const auth = getAuth(req)
  return auth.userId ?? null
}
```

- [ ] **Step 5: Re-run test — expect PASS**

```bash
cd server && npm test -- src/auth/clerk.test.ts
```

- [ ] **Step 6: Wire `clerkMiddleware` in `server/src/index.ts`**

After `loadEnv` / config imports and `const app = express()`:

```typescript
import { clerkMiddleware } from '@clerk/express'
import { requireAuth } from './auth/clerk.js'

app.use(cors({ origin: config.corsOrigin }))
// Stripe webhook needs raw body — register BEFORE express.json()
// (move webhook route registration above json parser if not already)

app.use(clerkMiddleware())
app.use(express.json({ limit: '1mb' }))

// Protect cloud routes
app.use('/api/workbooks', requireAuth, workbooksRouter)
// …same for versions/shares mutate routes; keep GET /api/shared/:token public
```

Public exceptions (do **not** apply `requireAuth`):
- `GET /health`
- `GET /api/shared/:token` and `GET /api/shares/:token` (read-only share view)
- `POST /api/stripe/webhook`
- Optionally allow unauthenticated `POST /api/chat` only if free anonymous remains desired — **this plan requires auth for LLM chat** once Clerk is live (see Task 7).

- [ ] **Step 7: Commit**

```bash
git add server/src/auth/clerk.ts server/src/auth/clerk.test.ts server/src/index.ts server/package.json server/package-lock.json
git commit -m "feat: add Clerk Express middleware helpers for SmartSht JWT auth"
```

---

### Task 5: Replace spoofable `x-user-id` in all cloud routers

**Files:**
- Modify: `server/src/routes/workbooks.ts`
- Modify: `server/src/routes/shares.ts`
- Modify: `server/src/routes/versions.ts`
- Modify: `server/src/routes/templates.ts`

- [ ] **Step 1: In each router, delete local `getUserId` that reads headers/body**

Replace with:

```typescript
import type { Request } from 'express'
import { getRequestUserId } from '../auth/clerk.js'

function getUserId(req: Request): string | null {
  return getRequestUserId(req)
}
```

Ensure route handlers pass `req` (Express Request), not a cast of headers-only objects.

- [ ] **Step 2: Manual negative test**

With server running and Clerk configured:

```bash
curl -s -o - -w "%{http_code}" -H "x-user-id: user_fake" https://localhost:8787/api/workbooks
```

Expected: `401` (spoofed header ignored).

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/workbooks.ts server/src/routes/shares.ts server/src/routes/versions.ts server/src/routes/templates.ts
git commit -m "fix: derive cloud API userId from Clerk JWT instead of x-user-id"
```

---

## Phase C — Client: tokens, user sync, usage UI

### Task 6: ClerkUserSync + Bearer tokens in cloudSync

**Files:**
- Create: `src/auth/ClerkUserSync.tsx`
- Modify: `src/lib/cloudSync.ts`
- Modify: `src/main.tsx`
- Modify: `src/auth/index.ts`

- [ ] **Step 1: Add async token provider to `cloudSync.ts`**

Replace spoof header path:

```typescript
type TokenProvider = () => Promise<string | null>
let _tokenProvider: TokenProvider | null = null

export function setAuthTokenProvider(provider: TokenProvider): void {
  _tokenProvider = provider
}

export function setUserId(userId: string | null): void {
  if (userId) localStorage.setItem('smartsht-user-id', userId)
  else localStorage.removeItem('smartsht-user-id')
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = _tokenProvider ? await _tokenProvider() : null
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
```

Update every `fetch` in this file to `await getAuthHeaders()` (functions already async).

Keep reading `smartsht-user-id` only for `isCloudConfigured()` UX gating (presence of signed-in user id), not for auth.

- [ ] **Step 2: Create `src/auth/ClerkUserSync.tsx`**

```tsx
import { useAuth } from '@clerk/react'
import { useEffect } from 'react'
import { setAuthTokenProvider, setUserId } from '@/lib/cloudSync'

export function ClerkUserSync() {
  const { isSignedIn, userId, getToken } = useAuth()

  useEffect(() => {
    setAuthTokenProvider(async () => {
      if (!isSignedIn) return null
      return (await getToken()) ?? null
    })
  }, [isSignedIn, getToken])

  useEffect(() => {
    setUserId(isSignedIn && userId ? userId : null)
  }, [isSignedIn, userId])

  return null
}
```

- [ ] **Step 3: Mount inside ClerkProvider / AuthGate in `main.tsx`**

```tsx
<AuthProvider>
  <AuthGate>
    <ClerkUserSync />
    <App />
  </AuthGate>
</AuthProvider>
```

`ClerkUserSync` must only render when publishable key exists (AuthProvider already gates). If AuthGate blocks signed-out users, sync only runs when signed in — correct.

- [ ] **Step 4: Export from `src/auth/index.ts`**

```typescript
export { ClerkUserSync } from './ClerkUserSync'
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloudSync.ts src/auth/ClerkUserSync.tsx src/main.tsx src/auth/index.ts
git commit -m "feat: sync Clerk session into cloud API Bearer tokens"
```

---

### Task 7: Authenticated chat + server-side Pro (no client isPro trust)

**Files:**
- Modify: `src/ai/agentClient.ts`
- Modify: `server/src/index.ts` (`/api/chat`, `/api/chat/stream`, `/api/checkout`, `/api/usage`)
- Modify: `src/auth/UpgradePrompt.tsx` (checkout uses Bearer)
- Modify: `src/components/ChatPanel.tsx` (usage + UpgradePrompt)
- Modify: `src/App.tsx` or `MenuBar.tsx` (UserNav)

- [ ] **Step 1: agentClient sends Bearer token**

```typescript
import { getAuthHeadersForApi } from '@/lib/cloudSync'
// or export a shared getAuthHeaders from cloudSync

async function authHeaders(): Promise<Record<string, string>> {
  // reuse cloudSync token provider — export getAuthHeaders
  return getAuthHeaders()
}

// in chatWithAgentServerStream / chatWithAgentServer:
headers: await authHeaders(),
body: JSON.stringify({ message, context, history }), // no isPro, no userId
```

- [ ] **Step 2: Server chat usage from Clerk auth + metadata**

In stream/chat handlers, replace body `userId`/`isPro` with:

```typescript
import { getAuth, clerkClient } from '@clerk/express'
// or getClerkClient from ./auth/clerk.js

const auth = getAuth(req)
const userId = auth.userId ?? undefined
let isPro = false
if (userId && config.clerkSecretKey) {
  const user = await getClerkClient().users.getUser(userId)
  isPro = planFromPublicMetadata(user.publicMetadata as Record<string, unknown>) === 'pro'
}
const usage = checkUsage(userId, isPro)
```

Apply `requireAuth` to `/api/chat` and `/api/chat/stream` **or** allow anonymous with stricter `__anonymous__` limit — **choose requireAuth** for production SmartSht (AuthGate already forces sign-in).

- [ ] **Step 3: `/api/checkout` uses auth.userId, ignores body.userId**

```typescript
app.post('/api/checkout', requireAuth, async (req, res) => {
  const userId = getRequestUserId(req)!
  const { email } = req.body as { email?: string }
  // prefer email from Clerk user object if body email empty
  ...
})
```

UpgradePrompt still may send email for convenience, but server must not trust client userId.

- [ ] **Step 4: Mount UI**

In `ChatPanel.tsx`:
```tsx
import { useUsage, UpgradePrompt } from '@/auth'
const { canAsk, remaining, dailyLimit, recordUsage, isPro } = useUsage()
// gate sendMessage when !canAsk; render <UpgradePrompt remaining={remaining} dailyLimit={dailyLimit} />
```

In `App.tsx` header or `MenuBar.tsx`:
```tsx
import { UserNav } from '@/auth'
// render <UserNav />
```

- [ ] **Step 5: Commit**

```bash
git add src/ai/agentClient.ts src/lib/cloudSync.ts server/src/index.ts src/auth/UpgradePrompt.tsx src/components/ChatPanel.tsx src/App.tsx src/components/MenuBar.tsx
git commit -m "feat: authenticate chat/checkout via Clerk and mount usage UI"
```

---

### Task 8: localStorage key migration (`smartshit-*` → `smartsht-*`)

**Files:**
- Modify: `src/lib/persistence.ts`
- Modify: `src/components/WelcomeOverlay.tsx`
- Modify: `src/lib/communityTemplates.ts`
- Modify: `src/ai/chatFeedback.ts` / `src/ai/telemetry.ts` if they use `smartshit-`
- Create: `src/lib/storageKeys.ts`

- [ ] **Step 1: Create helper**

```typescript
// src/lib/storageKeys.ts
export function migrateLocalStorageKey(oldKey: string, newKey: string): void {
  if (localStorage.getItem(newKey) != null) return
  const old = localStorage.getItem(oldKey)
  if (old == null) return
  localStorage.setItem(newKey, old)
  localStorage.removeItem(oldKey)
}
```

- [ ] **Step 2: Map keys**

| Old | New |
|-----|-----|
| `smartshit-state-v1` | `smartsht-state-v1` |
| `smartshit-welcome-dismissed` | `smartsht-welcome-dismissed` |
| `smartshit-community-templates` | `smartsht-community-templates` |
| `smartsht_usage` | keep (already smartsht) |
| `smartsht-user-id` | keep |
| `smartsht-cloud-workbook-id` | keep |
| `smartsht-import-shared` | keep |

Call `migrateLocalStorageKey` once at app boot in `main.tsx` before render.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storageKeys.ts src/lib/persistence.ts src/components/WelcomeOverlay.tsx src/lib/communityTemplates.ts src/main.tsx
git commit -m "refactor: migrate localStorage keys to smartsht-* with fallback"
```

---

## Phase D — Stripe live + webhook → Clerk metadata

### Task 9: Complete Stripe webhook → Clerk publicMetadata

**Files:**
- Modify: `server/src/index.ts` (webhook handler)
- Modify: `server/src/stripe.ts` if needed (return subscription id)
- Test: manual curl with invalid sig still 400

- [ ] **Step 1: On `checkout.session.completed`, update Clerk user**

```typescript
if (result) {
  const client = getClerkClient()
  await client.users.updateUser(result.userId, {
    publicMetadata: {
      plan: result.plan,
      ...(result.plan === 'pro' ? { stripeSubscriptionId: /* from event if available */ } : { stripeSubscriptionId: null }),
    },
  })
}
```

Extend `handleStripeWebhook` to return `stripeSubscriptionId` when present on the session/subscription object.

- [ ] **Step 2: Fix webhook raw body ordering**

Ensure `POST /api/stripe/webhook` is registered with `express.raw({ type: 'application/json' })` **before** global `express.json()`, or use a path-specific raw parser. Signature verification fails if body was already parsed.

- [ ] **Step 3: Production env checklist (implementer fills secrets on EC2)**

On EC2 `/home/ubuntu/smartsht/server/.env` (loaded by dotenv):

```bash
CLERK_SECRET_KEY=sk_live_...          # SmartSht only
CLERK_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...         # NOT sk_test_
STRIPE_PRICE_ID=price_...             # live price
STRIPE_WEBHOOK_SECRET=whsec_...       # from Stripe dashboard endpoint
APP_URL=https://smartsht.com
```

Stripe Dashboard: endpoint URL `https://smartsht.com/api/stripe/webhook`, events `checkout.session.completed`, `customer.subscription.deleted`.

- [ ] **Step 4: Verify webhook endpoint**

```bash
curl.exe -s -X POST https://smartsht.com/api/stripe/webhook -H "Content-Type: application/json" -d "{}"
```

Expected after config: error about missing/invalid signature — **not** `STRIPE_WEBHOOK_SECRET not configured`.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/stripe.ts server/src/auth/clerk.ts
git commit -m "feat: sync Stripe subscription plan into Clerk publicMetadata"
```

---

## Phase E — Production rebuild & cutover

### Task 10: Rebuild frontend with SmartSht `pk_live_` and deploy

**Critical finding to reverse:** Production `/var/www/smartsht/app/index.html` currently embeds `pk_test_…` (amused-mollusk / wrong instance). Local `.env.local` already has SmartSht `pk_live_Y2xlcmsuc21hcnRzaHQuY29t…`.

- [ ] **Step 1: Confirm `.env.local` publishable key decodes to `clerk.smartsht.com`**

```powershell
# key form pk_live_<base64>
# Must NOT contain amused-mollusk
Select-String -Path .env.local -Pattern "VITE_CLERK_PUBLISHABLE_KEY"
```

Expected: `pk_live_` and base64 payload referring to `clerk.smartsht.com`.

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Verify built artifact**

```bash
# dist or build output for vite-plugin-singlefile — typically dist/index.html
Select-String -Path dist/index.html -Pattern "pk_(live|test)_"
```

Expected: **only** `pk_live_`, zero `pk_test_`.

- [ ] **Step 4: Deploy SPA to EC2** `/var/www/smartsht/app/index.html` (existing S3/SSM deploy path).

- [ ] **Step 5: Deploy server build + restart PM2**

```bash
# on EC2 after syncing server code
cd /home/ubuntu/smartsht/server
pm2 restart smartsht-api
pm2 logs smartsht-api --lines 40
```

Startup logs must show Stripe ✓ and must not crash on missing Clerk when keys present. Add a boot log line:

```typescript
console.log(`Clerk: ${config.clerkSecretKey ? '✓ (SmartSht secret configured)' : '✗'}`)
```

- [ ] **Step 6: End-to-end verify on https://smartsht.com/app/**

1. Sign-in UI loads against SmartSht (check Network → Clerk requests hit `clerk.smartsht.com`).
2. After sign-in, create/save workbook → `/api/workbooks` returns 200 with `Authorization` header (not `x-user-id`).
3. Spoof `x-user-id` alone → 401.
4. Chat works while signed in.
5. JWKS reachable: [https://clerk.smartsht.com/.well-known/jwks.json](https://clerk.smartsht.com/.well-known/jwks.json).

- [ ] **Step 7: Commit any remaining deploy script/docs updates** (no secrets).

```bash
git commit -m "chore: document SmartSht production cutover checklist"
```

---

## Phase F — Dead env / BurntBeats cleanup (docs only)

### Task 11: Mark unused env vars and shared infra boundaries

**Files:**
- Modify: `docs/NAMING.md` or `docs/ENV.md`
- Modify: `.env.example` comments

Document clearly:

| Var | Used by smartsht? |
|-----|-------------------|
| `DATABASE_URL` | Yes |
| `S3_BUCKET`, `S3_REGION`, `S3_SMARTSHT_PREFIX`, `AWS_*` | Yes |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` | No — docs only |
| `S3_ENABLED`, `S3_PREFIX=stems`, `S3_DELETE_*` | No — BurntBeats |
| `CLERK_SECRET_KEY` | Yes (after this plan) |
| Shared RDS `burntbeats-db` / bucket `burntbeatz2-storage` | Shared infra OK; isolate via schema `smartsht` + prefix `smartsht/` |

- [ ] **Step 1: Write `docs/ENV.md` with the table above**
- [ ] **Step 2: Commit**

```bash
git add docs/ENV.md .env.example
git commit -m "docs: clarify which env vars smartsht actually loads"
```

---

## Out of scope (intentionally)

- Renaming GitHub repo `Ocean82/smartshit`
- Renaming Ollama model `smartshit` / env `SMARTSHIT_MODEL` (requires EC2 model recreate)
- Renaming Postgres schema `smartsht` or S3 prefix
- Migrating off shared BurntBeats RDS/S3 accounts (isolation already via schema/prefix)
- Full Clerk webhook receiver for `user.created` (optional follow-up; Stripe→Clerk is enough for Pro)

---

## Self-review checklist (author)

1. **Spec coverage:** Clerk SmartSht instance + JWKS, JWT middleware, token pass-through, env location/dotenv, Stripe webhook secret + live keys, naming inconsistencies, unused/wrong keys — all have tasks.
2. **Placeholders:** None intentionally left as TBD; production secret *values* are filled at cutover on EC2, not in git.
3. **Type consistency:** `getRequestUserId`, `planFromPublicMetadata`, `setAuthTokenProvider`, `requireAuth` naming is consistent across tasks.

---

## Suggested plan splits (optional later)

If execution is too large for one PR:
1. **Plan A (this file Tasks 1–3, 11):** naming + env loading
2. **Plan B (Tasks 4–8):** Clerk JWT + client
3. **Plan C (Tasks 9–10):** Stripe + production cutover

For now, keep as one sequenced plan — later phases depend on earlier ones.

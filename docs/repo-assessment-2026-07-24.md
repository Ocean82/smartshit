# smartsh!t — Repository Review & Assessment

**Date:** 2026-07-24
**Reviewed commit:** `fb5d6fe` ("performance improvements") on `main`
**Reviewer:** Arena Agent Mode
**Scope:** Full repo — architecture, code quality, security, build/test health, product/docs, release readiness

---

## 1. Executive Summary

smartsh!t is an **AI-augmented web spreadsheet** (React 19 + Vite 7 + Formualizer) with an Express 5 API that fronts several LLM providers. Its genuinely differentiated ideas are the **client-side formula auditor** and the **hybrid intent router** that answers most requests deterministically without an LLM round-trip.

**Overall grade: B / B+ — a strong, unusually disciplined solo project that is close to, but not quite at, production-hardened.**

Everything I ran, passed:

| Gate | Result |
|---|---|
| `npm ci` (root + server) | ✅ clean |
| `npm run typecheck` (`tsc --noEmit`, strict) | ✅ **zero errors** across ~44k LOC |
| `npm test` (frontend) | ✅ 242 tests / 26 files |
| `npm test` (server) | ✅ 26 tests / 5 files |
| `npm run build` (both) | ✅ 8s, 2.0 MB single-file bundle (569 KB gzip) |
| `npm run release:check:v1` | ✅ all 8 gates pass |
| Live server smoke test | ✅ boots, `/health` 200, auth-gated routes return 401 |

That is a better-than-average health baseline. The issues below are mostly about **operational maturity and blast radius**, not correctness.

---

## 2. What the Project Is

| Layer | Tech | LOC |
|---|---|---|
| Frontend | React 19, Vite 7, Tailwind 4, Zustand+Immer, Formualizer | ~39.4k (`src/` + `shared/`) |
| Backend | Express 5, TypeScript, SSE streaming, Zod, Postgres (`pg`), S3 | ~4.7k (`server/src/`) |
| Tests | Vitest, 32 test files | ~3.3k |
| AI | Ollama (local) / OpenRouter / Groq / HuggingFace / BYOK | — |
| Auth & billing | Clerk (JWT), Stripe (hand-rolled HTTP + HMAC webhook verify) | — |
| Docs | 106 markdown files | — |

Feature surface is broad: grid with formulas, xlsx/CSV I/O, charts, pivots, conditional formatting, validation, find/replace, undo/redo, 54 templates, 10 auditor rules, cloud save + version history + share links, PWA/service worker, Sentry, free-tier metering.

---

## 3. Strengths

### 3.1 The hybrid AI architecture is the real IP
`shared/actTemplates.ts` + `shared/intentParser.ts` + `src/agent/parser.ts` resolve common requests ("bold the headers", "sort by amount", "build a budget") with **zero LLM latency and zero token cost**. Only open-ended questions escalate to a provider. `src/ai/brain.ts` runs deterministic analysis (budgets, outliers, audit findings) locally in the browser. This is a materially different cost/latency profile from LLM-wrapper competitors, and it means the app degrades gracefully to "useful" rather than "broken" when AI is unavailable — which the code handles honestly (`⚠️ AI is currently unavailable…` rather than hallucinating).

### 3.2 The auditor is a genuine differentiator
10 rules in `src/auditor/rules/` — range gaps, inconsistent formulas, hardcoded constants, circular refs, magnitude outliers, orphaned formulas, volatile functions, hidden dependencies, duplicate formulas, error cells. The range-gap rule (a `SUM` that silently skips an adjacent populated cell) catches a class of accounting error that Excel and Sheets do not surface. Findings carry severity, cell locations, a suggestion, and an `autoFixable` fix action. This is well-modeled and cleanly extensible.

### 3.3 Type discipline is excellent
Strict TypeScript, `noFallthroughCasesInSwitch`, and **3 total uses of `any`** in ~44k lines. **Zero `console.log`** in `src/`. Zero `TODO`/`FIXME`/`HACK` markers. `dangerouslySetInnerHTML` appears nowhere. That is unusually clean for a project of this size and velocity.

### 3.4 Security fundamentals are mostly right
- All SQL uses parameterized queries — no injection surface found.
- Every cloud route re-verifies `owner_id === userId` after the auth middleware (defense in depth, not just route-level `requireAuth`).
- Stripe webhook signature verification is hand-rolled but **correct**: HMAC-SHA256, `crypto.timingSafeEqual`, 5-minute replay tolerance, raw body registered before `express.json()`.
- Checkout price is server-controlled (`config.stripePriceId`) — client cannot spoof the plan.
- Free-tier metering is enforced **server-side** (`server/src/usage.ts`), not just in the client hook — so clearing localStorage doesn't grant free questions.
- Zod validation on chat bodies; rate limiters on chat, checkout, and globally.
- Sentry configured with `sendDefaultPii: false`.
- No secrets committed. `.env.example` uses placeholders only.

### 3.5 Performance work is real, not cosmetic
`src/lib/historyDiff.ts` replaced full-workbook JSON snapshots with cell-level patches (`O(changedCells × depth)` instead of `O(workbookSize × depth)`) — this was flagged in the project's own earlier review and is now fixed. `GridCell` is `React.memo`'d; `App.tsx` lazy-loads 12 dialogs/panels; the grid uses 42 memo/callback hooks. Import guardrails cap at 5,000 rows / 200 cols / 50 MB with user-visible truncation warnings.

### 3.6 Accessibility is not an afterthought
117 `aria-*`/`role` attributes, including proper `role="grid"` / `role="row"` / `role="columnheader"` / `aria-rowindex` semantics on the spreadsheet, plus a `useFocusTrap` hook for dialogs.

### 3.7 CI and release gating exist
`.github/workflows/ci.yml` runs both test suites and both builds on push/PR. `scripts/v1-release-checklist.mjs` is a custom gate that asserts specific safety invariants still exist in the code (import truncation guardrails, preview-denial gate, telemetry instrumentation). Encoding invariants as executable checks is a mature practice.

---

## 4. Issues — Ranked

### 🔴 P0-1 — Rate limiters crash-warn on boot and can be bypassed over IPv6
`server/src/middleware/rateLimit.ts` uses a custom `keyGenerator` that falls back to `req.ip`. On boot, `express-rate-limit` v8 emits:

```
ValidationError: Custom keyGenerator appears to use request IP without calling the
ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to
bypass limits.  [ERR_ERL_KEY_GEN_IPV6]
```

Twice — once for `chatRateLimiter`, once for `checkoutRateLimiter`. The server still starts, but **anonymous IPv6 clients get a per-address key from a /128 space**, i.e. effectively unlimited requests. Given the chat limiter is your LLM-cost circuit breaker, this is a direct spend-exposure bug.

**Fix:** import `ipKeyGenerator` from `express-rate-limit` and wrap the IP fallback:
```ts
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
const getUserKey = (req: Request) =>
  (req as any).auth?.userId || ipKeyGenerator(req.ip ?? '')
```

### 🔴 P0-2 — No `trust proxy`, so IP-based limiting is globally broken in production
`landing/smartsht.nginx.conf` proxies `/api/` to `127.0.0.1:8787` and sets `X-Forwarded-For`, but the Express app never calls `app.set('trust proxy', 1)`. Every request therefore reports `req.ip === '127.0.0.1'`. Consequences:
- `globalRateLimiter` (100/min per IP) becomes **100/min for the entire internet** — a trivial self-DoS.
- `aiFunctionRouter`'s own in-memory per-IP limiter (30/min) collapses the same way.

**Fix:** `app.set('trust proxy', 1)` before registering limiters. Pair with P0-1.

### 🔴 P0-3 — `/api/ai-function` is completely unauthenticated
`app.use('/api/ai-function', aiFunctionRouter)` — no `requireAuth`, no Clerk gate, no usage metering. I confirmed this against a running instance: an unauthenticated POST reaches the provider-dispatch path and returns `502 AI providers failed` only because no key was configured. **With a real `GROQ_API_KEY`/`OPENROUTER_API_KEY` set, this is an open, anonymous LLM proxy on the public internet**, throttled only by the broken per-IP limiter from P0-2. Ten `AI.*` functions are exposed, including `AI.SUMMARIZE` and `AI.TRANSLATE` — attractive targets for free-inference abuse.

**Fix:** add `requireAuth` + `checkUsage`/`recordUsage` to the router, exactly as `/api/chat` does.

### 🟠 P1-1 — Usage metering is in-memory and resets on deploy
`server/src/usage.ts` stores counts in a `Map`. The file's own comment acknowledges it ("For scale: replace with Redis or a simple SQLite file"). Two concrete consequences:
- `pm2 restart` → every free user's daily count resets to zero.
- Any horizontal scaling (2+ processes) multiplies the free tier by the process count.

Also, all anonymous users collapse into one `'__anonymous__'` bucket — the first 3 anonymous requests globally consume the day's allowance for everyone. Postgres is already a dependency; a `usage_daily(user_id, date, count)` table is a ~20-line fix.

### 🟠 P1-2 — `express.json({ limit: '1mb' })` will silently break cloud save
`POST/PUT /api/workbooks` sends `JSON.stringify(workbook)` as a string field inside a JSON body — i.e. the workbook is **double-encoded**, inflating it. Import limits allow 5,000 rows × 200 cols. A moderately populated sheet blows past 1 MB, and the client's `saveToCloud` swallows the resulting 413 into `setSyncStatus('error')` with no user-facing message. Users will lose cloud saves without knowing why.

**Fix:** raise the limit for `/api/workbooks` specifically (e.g. `express.json({ limit: '25mb' })` mounted on that path), send the workbook as a real object rather than a nested string, and surface 413 distinctly in `cloudSync.ts`.

### 🟠 P1-3 — `CORS_ORIGIN` defaults to `*`
`config.corsOrigin = process.env.CORS_ORIGIN ?? '*'`, and `.env.example` ships `CORS_ORIGIN=*`. Credentials aren't sent cross-origin (Clerk uses bearer tokens, so this isn't a classic CSRF hole), but a wildcard default means any site can drive the API with a stolen/leaked token and makes the unauthenticated `/api/ai-function` endpoint trivially embeddable in third-party pages. Default to `config.appUrl` and require an explicit opt-in for `*`.

### 🟠 P1-4 — Share links: `permission: 'edit'` is accepted but never enforced
`POST /:id/share` accepts `permission: 'view' | 'edit'`, stores it, and both `ShareDialog.tsx` and `SharedView.tsx` render "Can edit". But `GET /api/shared/:token` only ever returns data, and no write path consults `share.permission`. This is a UI promise the backend doesn't keep. Either implement the write path or hide the option until it exists — right now a user can hand out an "edit" link that silently doesn't.

Related, smaller: share tokens are `randomUUID()` (v4, 122 bits of entropy) — acceptable, but note revocation is delete-only and there's no audit trail of access.

### 🟠 P1-5 — Unbounded version history
`PUT /api/workbooks/:id` writes a **new S3 object plus a new DB row on every auto-save**, with a 5-second debounce (`cloudSync.ts: DEBOUNCE_MS = 5_000`) and no pruning anywhere in `routes/versions.ts`. An active editing session generates hundreds of full workbook snapshots per hour. This is an unbounded S3 cost and storage leak. Cap at N versions (or time-window them) and prune on write.

### 🟡 P2-1 — Known-vulnerable dependencies
`npm audit`: 4 vulnerabilities (3 high, 1 low).
- **`xlsx@0.18.5` — high, and there is no fix on npm.** Two advisories: prototype pollution (GHSA-4r6h-8v6p-xvw6, fixed in ≥0.19.3) and ReDoS (GHSA-5pgg-2g8v-p4x9, fixed in ≥0.20.2). SheetJS moved off the npm registry after 0.18.5, so `npm audit fix` cannot resolve this. **This is your file-import path — untrusted user files are parsed by a library with a known prototype-pollution CVE.** Migrate to the SheetJS CDN distribution (`https://cdn.sheetjs.com/xlsx-0.20.x/…`) or swap to `exceljs`.
- `vite@7.3.2` — high (`server.fs.deny` bypass on Windows) + moderate; dev-server-only, bump to >7.3.4.
- `postcss ≤8.5.17` — high, path traversal via sourceMappingURL; build-time only.

### ~~🟡 P2-2 — HyperFormula GPLv3 licensing conflict~~ ✅ RESOLVED
The formula engine has been replaced with `@ocean8219/formualizer`, a permissively-licensed fork. The GPLv3 copyleft conflict no longer applies. The project is correctly MIT-licensed throughout.

### 🟡 P2-3 — No linter or formatter
No ESLint, no Prettier, no `.editorconfig`. Style is currently consistent because there's one author, but `src/store/useStore.ts` uses semicolons while `server/src/*` doesn't — the drift has already started. CI runs tests and builds only. Adding `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` to CI would catch a class of React bugs (`useIsSignedIn()` in `AuthProvider.tsx` calls `useAuth()` inside a `try`/after an early return — a conditional-hook violation that lint would flag immediately).

### 🟡 P2-4 — Test coverage is lopsided
242 + 26 tests is respectable, but the distribution is telling:

| Area | Tests | Source files |
|---|---|---|
| `src/lib` | 9 | 24 |
| `src/ai` | 6 | 21 |
| `src/templates` | 3 | 14 |
| `src/components` | **0** | 47 |
| `src/engine` | **0** | 3 |
| `server/src/routes` | **0** | 5 |

Zero component tests (no React Testing Library), zero tests on the Formualizer wrapper, zero tests on any HTTP route — including the ownership checks and the Stripe webhook. The auth/ownership logic and `verifyWebhookSignature` are the highest-value untested code in the repo: they're pure, easy to test, and a regression there is a security incident. `supertest` + a `pg` mock would cover the routes in an afternoon.

### 🟡 P2-5 — God objects persist
`src/store/useStore.ts` is 1,496 lines and still owns workbook mutations, chat orchestration, clipboard, sort/filter, files, history, and toasts. Extraction has *started* — `src/store/slices/` (uiSlice, fileSlice) and `src/services/chatService.ts` exist and are well-designed — but the bulk hasn't moved. `src/components/SpreadsheetGrid.tsx` is 932 lines. `src/templates/personal-finance.ts` is 1,901 lines (data-heavy, less concerning). 21 files exceed 400 lines. This is the main day-2 maintainability tax.

### 🟡 P2-6 — Duplicated configuration constants
`FREE_DAILY_LIMIT = 3`, `maxHistoryCloud = 12`, `maxHistoryLocal = 4`, and `outlierStdThreshold = 2.5` are each defined **twice** — once in `src/ai/config.ts`/`src/auth/useUsage.ts` and again in `server/src/config.ts`/`server/src/usage.ts`. `shared/` already exists and is imported by both sides; these belong there. Right now changing the free tier requires two edits in two packages, and the client will happily disagree with the server about what the limit is.

### 🔵 P3 — Smaller items

| Item | Detail |
|---|---|
| **Broken PWA icon** | `index.html` and `public/manifest.json` reference `smartsht-favicon.PNG`, which **does not exist**. `public/` has `smart-favicon.png` (different name, different case). Every install/apple-touch icon 404s. |
| **2.6 MB PNG in the bundle** | `public/smart-logo.png` (2.5 MB) + `smart-favicon.png` (1.3 MB) are copied into `dist/` on every build — 3.8 MB of assets for a 2 MB app. Neither is referenced by the SPA (only by `landing/*.html`). Move them to `landing/` or compress to WebP. |
| **Agent scratch state is committed** | 150 of 466 tracked files live under `.superpowers/`, `.impeccable/`, `.junie/`, `.github/skills/` — task briefs, review diffs, a 448 KB `live-browser.js`, 32 reference docs. `.gitignore` even lists `.junie` but the files were committed before the rule existed, so it has no effect. This is ~1 MB of tooling exhaust in a product repo, and it's the first thing a prospective contributor sees. |
| **Single-commit history** | The whole project is one commit (`fb5d6fe`). No bisect, no blame, no review trail. Whatever squash/re-init produced this, avoid repeating it. |
| **`skipLibCheck: true`** | Standard, but combined with `types: ["node"]` in a DOM project it hides real `@types` conflicts. |
| **Health endpoint is unauthenticated and verbose** | `/health` returns provider names, model IDs, port, and DB/S3 error strings (`"DATABASE_URL not configured"`). Useful for ops, mild recon value for attackers. Consider a public shallow variant and an authenticated deep one. |
| **Error messages returned raw** | Most routes do `res.status(500).json({ error: err.message })`, which can surface `pg` and AWS SDK internals to clients. Log the detail, return a generic message + correlation ID. |
| **No Dockerfile / IaC** | Deployment is documented prose (nginx conf + PM2 references in docs). Fine for a single EC2 box; a blocker for reproducibility. |
| **README/roadmap drift** | README lists "Auto-insights on import" and "Auditor auto-run on import" as *Next up*, but `src/ai/sheetInsights.ts`, `InsightsPanelContent.tsx`, and `AuditPanelContent.tsx` all exist and are wired. The roadmap is behind the code. |

---

## 5. Documentation & Product

Documentation is a genuine strength and, unusually, an over-investment. 106 markdown files including 27 numbered planning docs, `PRODUCT.md` (with an articulated brand voice — "punk-in-a-jacket" — and an explicit anti-reference list), `DESIGN.md`, `CONTRIBUTING.md`, issue templates, an ENV matrix, and a naming-conventions doc. `docs/architecture-fix-plan.md` tracks prior review findings with checkboxes, and I verified the Phase-1 items (ErrorBoundary, Zod validation) are actually implemented — the docs are honest, not aspirational.

The README is genuinely good: clear problem statement, a feature table, an ASCII architecture diagram, a copy-pasteable quick start, and a screenshot. It would land well on Hacker News.

Two caveats: (a) the planning docs outnumber the tests, and some are stale relative to shipped code; (b) `docs/superpowers/plans/2026-07-12-auth-env-naming-hardening.md:720` quotes a truncated real publishable key prefix (`pk_live_Y2xlcmsuc21hcnRzaHQuY29t…`). Publishable keys are public by design so this is not a leak, but the habit of pasting production key material into committed docs is worth breaking.

---

## 6. Recommended Action Plan

**Before the next production deploy (hours, not days):**
1. `app.set('trust proxy', 1)` + `ipKeyGenerator` in `rateLimit.ts` — P0-1, P0-2.
2. Add `requireAuth` + usage metering to `/api/ai-function` — P0-3.
3. Default `CORS_ORIGIN` to `config.appUrl` — P1-3.
4. Raise the JSON body limit for workbook routes and surface 413 to the user — P1-2.
5. Fix the `smartsht-favicon.PNG` reference — P3, 2 minutes.

**Next sprint:**
6. Move usage counters into Postgres — P1-1.
7. Prune version history (cap at ~50, or 30 days) — P1-5.
8. Either implement or remove `permission: 'edit'` on shares — P1-4.
9. Migrate off npm `xlsx@0.18.5`; bump `vite` and `postcss` — P2-1.
10. Add ESLint + `eslint-plugin-react-hooks` to CI — P2-4 (and it will catch the `useIsSignedIn` hook violation).

**This quarter:**
11. ~~Get clarity on the **HyperFormula GPLv3-vs-MIT conflict** — P2-2.~~ ✅ Resolved — migrated to `@ocean8219/formualizer`.
12. Route tests with `supertest` (ownership checks + Stripe webhook first) — P2-4.
13. Continue the `useStore` slice extraction already begun — P2-5.
14. Consolidate duplicated constants into `shared/` — P2-6.
15. Prune committed agent scratch state; add a `.gitignore` sweep — P3.

---

## 7. Verdict

This does not read like a weekend prototype. Strict types with three `any`s, zero stray `console.log`, a passing custom release gate, honest AI-unavailable fallbacks, server-enforced metering, and a correctly hand-rolled Stripe HMAC verification all point to a developer who has thought carefully about the difference between "works on my machine" and "works for strangers." The auditor and the deterministic intent router are real product ideas, not AI-wrapper table stakes.

The gap is **operational**. The three P0s share a root cause: infrastructure-boundary assumptions that were never validated against a running system — the proxy layer that rewrites `req.ip`, the one router that missed the auth middleware, the IPv6 warning that scrolls past on boot. Each is a small diff. Together they mean that the moment a real `GROQ_API_KEY` lands on a public box, the LLM budget is unprotected.

Fix the P0s this week and this is a solidly production-ready v1.

**Grade: B+ on engineering craft, C+ on operational hardening, A– on documentation and product thinking.**

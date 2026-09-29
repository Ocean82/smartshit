# Verification backlog (further testing required)

Items a code review could not verify in a sandbox (no live LLM keys, no DB/S3/AWS,
models absent, single browser). These are **things to test**, not known bugs.
Each row lists why it needs a live/integration environment and how to verify.

Where this session already produced coverage or a code fact, it's noted inline so
we don't re-derive it.

---

## 1. Real formula-engine behavior end-to-end

- **Why:** Unit tests alias the WASM engine to a stub (see
  `src/__mocks__/@ocean8219/formualizer.stub.ts`). App logic is verified against a
  toy evaluator.
- **Partly covered now:** a real-WASM integration tier exists —
  `npm run test:realengine` (`src/engine/formualizer.realengine.test.ts`) covers
  recalc, cross-sheet refs, circular (`#CIRC!`), `#DIV/0!`, `#NAME?`. It runs in
  CI. What's still missing is *end-to-end through the UI*.
- **Verify:** Playwright E2E against `vite build && vite preview` — import a real
  `.xlsx` with formulas → computed values match Excel; delete a referenced row →
  `#REF!`; create a circular ref → auditor flags it; export → re-import round-trip
  is lossless.

## 2. Live LLM providers (failover, streaming, rate limits)

- **Why:** No provider keys in sandbox. Circuit breakers, SSE streaming through
  nginx (`proxy_buffering off`), structured-output retry, and 429 handling are
  untested against real endpoints.
- **Verify:** Staging with real Groq/OpenRouter keys — kill the Groq key
  mid-session → confirm OpenRouter takeover + the UI failover message; load-test
  ~50 concurrent streams; confirm token-by-token rendering (not buffered).

## 3. Clerk + Stripe full lifecycle

- **Why:** Auth gate, JWT `azp` across apex/www, `ClerkUserSync`, free-tier counter
  across devices, and checkout → webhook → plan flip → pro-cache invalidation need
  live services.
- **Verify:** Stripe test mode end-to-end — subscribe → `/api/chat` stops metering
  → cancel → quota returns; inspect `ai_usage_daily` rows; replay a webhook and
  confirm idempotency (`handleStripeWebhook` reads as idempotent — verify).

## 4. Postgres migrations on a fresh RDS

- **Why:** No DB in sandbox. Migrations `001–003`, `sslmode=require`, pool sizing,
  RDS failover.
- **Verify:** `docker run postgres` + `node server/scripts/run-migration.mjs` twice
  (idempotency), then run the workbook CRUD + shares + versions suites against it;
  measure pool behavior under ~100 concurrent saves.

## 5. S3 version history

- **Why:** No AWS in sandbox. `downloadObject`/presign paths in shares & versions.
- **Verify:** MinIO in docker — save → share → GET `/api/shared/:token` round-trip;
  verify presigned-URL expiry and deleted-workbook object cleanup (or intentional
  retention).

## 6. ONNX inference paths A & B

- **Why:** Models absent, NuGet blocked in sandbox. Client MiniLM worker (~27MB)
  and server `SessionPool` under load.
- **Resolved code fact (PM2 cwd):** the reviewer flagged the ecosystem file as
  gitignored/unconfirmable. It is committed (`server/ecosystem.config.cjs`, only
  ESLint-ignored) and sets `cwd: '/opt/smartsht/current/server'`. Since
  `modelsRoot = path.resolve(process.cwd(), 'models')` (`server/src/index.ts`),
  server models resolve to `/opt/smartsht/current/server/models` — **correct, as
  long as PM2 is started via the ecosystem file** (not `pm2 start dist/... ` from
  another cwd). Worth asserting on the box.
- **Verify:** On prod — `pm2 describe smartsht-api` → confirm `cwd`; hit
  `/api/onnx/*` with ~50 parallel requests; confirm intent classification falls
  back to regex when the model 404s (graceful path is coded — confirm in devtools).

## 7. Browser matrix for WASM / workers

- **Why:** `wasm-unsafe-eval` CSP, SAB-threaded ONNX wasm, and module workers differ
  across Safari/Firefox/mobile.
- **Verify:** Playwright matrix (Chromium/WebKit/Firefox) on the built app; for
  Safari iOS specifically: SW update flow (`sw.js` version bump), worker init, and
  clipboard/export.

## 8. Performance with max-size imports (5,000 × 200 guardrail)

- **Why:** GridCanvas, undo stack, persistence, and the auditor all scale with cell
  count. Note: persistence now surfaces a quota toast + quarantines corrupt state
  (see `src/lib/persistence.ts`), but the large-import latency profile is untested.
- **Verify:** Script a 5k×200 `.xlsx` import; measure import time, typing latency
  (canvas FPS), `localStorage` save time, and auditor run time; profile the main
  thread with Chrome tracing.

## 9. BYOK SSRF — exploitation vs. fix

- **Why:** Needs an environment with internal endpoints to demonstrate/refute.
- **Partly covered now:** the SSRF hardening shipped — redirects refused
  (`redirect: 'manual'`), DNS-resolution guard (`assertPublicByokHost`), and
  IP-encoding/range checks (`server/src/schemas/byok.ts`), with unit + DNS-mock
  tests. What remains is a **live** demonstration.
- **Verify:** In staging, point BYOK `baseUrl` at a public host that 302s to
  `http://169.254.169.254/latest/meta-data/` and at `http://[::ffff:127.0.0.1]:8787/health`;
  confirm the server refuses to fetch. Keep these as live regression checks.

## 10. Vite dev-server host allowlist in embedded/preview contexts

- **Why:** Vite's default `allowedHosts` blocks unknown Host headers (a preview
  proxy hit 403 until `allowedHosts: true`).
- **Resolved code fact:** `vite.config.ts` sets no `allowedHosts`, so the strict
  default is in effect. The dev server is not deployed to prod, so strict is fine
  there.
- **Decide/verify:** keep strict for the committed config; document the
  `allowedHosts` override for sandboxed/preview/tunnel dev (ngrok, e2b). Verify
  `npm run dev` behind a common tunnel with the override.

## 11. P0 usefulness gate — never smoke-tested against a real workbook

- **Why:** `docs/strategy/2026-09-24-usefulness-first-strategy.md` §3 defines a
  6-step smoke-test gate for P0 and marks P0 **COMPLETE (2026-09-25)**, but the
  gate has no recorded result. P0 and P1 are both now in production
  (`67dfe4a` then `c4bf3e6`); CI covers unit/realengine tiers only, and none of
  the 6 steps can be exercised without a human and a real `.xlsx`.
- **Verify (unchanged from the strategy doc):**
  1. Import a representative budget `.xlsx`.
  2. Key totals match Excel — or the user is explicitly warned.
  3. Insights + critical audit findings are visible without using chat.
  4. ≥5 grounded Q&A turns with no nonsense answers.
  5. Safe edits work with preview and undo.
  6. No marketing claims are made for stub surfaces.
- **Resolved in code (2026-09-28):** the cross-session caveat is now surfaced to
  the user rather than left implicit. `persistenceCaveat()` in
  `src/lib/styleRecipes.ts` returns a warning for `style_recipe`, and
  `ActionCard` in `ChatPanel.tsx` renders it above Apply/Reject. It states that
  undo covers the session only and that the writes are permanent once the file is
  saved and reopened. Two unit tests pin the mapping and the default-off
  behaviour for other tools. `total_row` idempotency is covered separately by
  `totalsTargetRange` (3 tests).
- **Still a human check:** the caveat's wording and placement have not been seen
  rendered in the browser, and the underlying undo behaviour has not been
  exercised end-to-end (apply a recipe → undo → confirm the sheet is restored).

### First live smoke test — partial, failed on Q&A (2026-09-28)

A real `Budget.xlsx` was imported. 11 sheets, all data present and correct: row
counts are computed from actual cells (`maxRow + 1` in `src/ai/sheetProfile.ts`)
and the import ceiling is `maxImportRows: 5_000` — the four sheets showing exactly
1000 rows genuinely contain 1000 populated rows each, so **step 1 passes and
nothing was silently truncated**.

**Step 4 failed.** Five consecutive explain requests (`Sheet1`, `Budget`,
`Tax_Estimates`, `Labor_Model`, then "explain this to me") returned blank or the
message *"I could not generate a response. Try rephrasing your question."* Root
cause was two server bugs, both in the provider failover path:

1. **An empty completion was accepted as success.** `callServerProviders`
   returned the first provider's result unconditionally, so a provider answering
   HTTP 200 with no content ended the chain. The user was then told to rephrase —
   advice that cannot help, because the cause was never their wording.
2. **Failing over silently cut the output-token budget by 63%.** Explain mode
   passed `maxTokens: undefined`, so each client applied its own default: Groq
   2048, but `openaiCompatible` only **768**. Repeated explain requests trip
   Groq rate limiting, which fails over to OpenRouter — exactly where the budget
   collapses. On a reasoning model, 768 output tokens can be spent entirely on
   reasoning, leaving `content` empty, which is the observed failure.

Fixed by `MAX_TOKENS_PER_CALL = 2048` for every provider (`server/src/index.ts`)
and by skipping empty completions via `isUsableCompletion()` in
`server/src/providers.ts` (5 tests), so the chain keeps failing over and a total
wipeout reports "AI unavailable" rather than blaming the user.

Also confirmed while investigating: the *"I analyze the active sheet"* line is
part of the import confirmation (`src/store/importOrchestration.ts`), not a
refusal to answer — named-sheet questions were blank for the reason above.

Steps 2, 3, 5, and 6 remain unexercised and still require a human pass.

## 12. Subscription entitlement — webhook-authoritative (2026-09-28)

- **What changed (unit-covered):** Pro recognition is now driven by Stripe webhooks
  plus a boot/daily reconciler, both writing a single source of truth in Clerk
  `publicMetadata` via `writeClerkPlan` — nothing on the request path decides
  entitlement. `handleStripeWebhook` handles `customer.subscription.created` and
  reconciles identity by email; the reconciler fails open (`unknown` never
  persists/revokes). `/api/usage` reports the *stored* `revocationReason` (from
  `resolveSubscriptionStatus`, normalized so `unknown` → `null`) — deliberately
  **no live Stripe call per request**. The client revocation banner
  (`SubscriptionNotice`) is driven by that stored state, so it is silent on an
  outage and never alarms spuriously.
- **Live-verified:** the webhook endpoint was exercised with a signed synthetic
  event returning 200 (the live signing secret was confirmed already matching; no
  change needed).
- **The owner's out-of-band subscription** (created outside Checkout) is healed by
  the email-identity fallback on the boot reconcile, ~60s after deploy. Watch the
  line `[reconcile] boot: verified N, changed M, unknown K` — `changed` should be
  ≥ 1 and Pro should surface in the app.
- **Still a human check:** the live cancel-and-resubscribe round trip — cancel in
  Stripe → the webhook revokes within seconds and the app shows the revocation
  banner → resubscribe → Pro returns. This is the real proof and cannot be
  automated from CI. Optionally subscribe `customer.subscription.created` in the
  Stripe dashboard.
- **Closed (2026-09-29, `5b18d43`):** the banner's CTA was a dead link to
  `/app#upgrade` (no such hash handler). It is now a button that calls the same
  `POST /api/checkout` the working upgrade CTAs use, single-sourced in
  `startCheckout()` (`src/auth/startCheckout.ts`, 4 tests, 7 mutants killed) and
  reused by `UpgradePrompt`; `subscriptionNoticeCopy` no longer returns an `href`,
  and a test pins that. `UpgradeGate` keeps its own call because it passes an
  `interval`. **Still a human check:** click the CTA in the browser and confirm the
  redirect lands on Stripe.

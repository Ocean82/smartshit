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

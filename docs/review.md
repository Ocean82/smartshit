# Project Review - 08.03.2026

I now have a complete, verified picture. Here's the full review.

---

# smartsh!t — Project Review

**What it is:** A React 19 + Vite frontend with an Express 5 backend, Formualizer (HyperFormula fork) formula engine, QuickJS sandbox, hybrid AI (local regex intent parser + LLM via OpenRouter/Groq/Ollama), Clerk auth, Stripe billing, and RDS+S3 cloud storage. MIT-licensed and self-hostable. Roughly 55k lines of frontend, 3.6k of backend, 369+34 tests passing, lint clean. It is **real, mostly well-built software** — not a vibe-coded prototype.

---

## 1. Where the flaws are

### Release-blocking bugs (in the revenue path)

1. **Free-tier paywall bypass.** The streaming endpoint `/api/chat/stream` enforces the 3-question daily cap (`server/src/index.ts:397-411`), but the **non-streaming `/api/chat` has no usage gate at all** (`server/src/index.ts:472-549`). The client itself uses that endpoint as its fallback (`src/ai/agentClient.ts:54`). Any authenticated user gets unlimited free LLM inference.

2. **Subscriptions never actually end.** `createCheckoutSession` puts `metadata[userId]` on the *checkout session* but never on the subscription (`server/src/stripe.ts:26`). Stripe doesn't copy session metadata to the subscription, so `customer.subscription.deleted` reads `obj.metadata.userId` → `undefined` → Pro stays granted **forever** (`stripe.ts:121-127`). Cancellations, refunds, and downgrades don't revoke access. `customer.subscription.updated` (past-due/canceled) is also unhandled even though DEPLOY.md subscribes to it.

3. **SSRF via BYOK `baseUrl`.** Users supply a `baseUrl` that passes only `z.string().url()` (`server/src/schemas/chat.ts:50-55`) — any scheme/host, including `169.254.169.254`, `10.x`, `localhost`. The `/api/ai-function` route doesn't even apply its own validation schema. Undici has no private-IP guard, so an authenticated user can point the server's fetch at internal hosts.

### Monetization vs. reality mismatch

4. **The landing page and pricing doc sell Pro features that are free in code.** Landing promises "unlimited AI, cloud backup, auto-fix, premium templates, version history" for $7 (`landing/index.html:52`). In code, only AI questions are gated. Cloud save/backup/sync is gated on *being signed in* (`src/lib/cloudSync.ts:139-141`), not on plan. Auditor auto-fix (`panels/AuditPanelContent.tsx:76`) and all templates are free for everyone. You're giving away your differentiators.

5. **The "in-browser NLP engine" is a stub.** `defaultLLMClassifier` returns `intentType: 'unknown', confidence: 0` (`src/ai/nlp/useNLPEngineInit.ts`), and `getBundledModel()` returns an empty `ArrayBuffer` placeholder (`src/ai/nlp/modelManager.ts`). No weights are committed. The worker path is only exercised by tests. Actual classification is the regex parser + server LLM. The flagship "privacy/local-first AI" demo doesn't exist in the browser yet.

6. **Fabricated ratings in the SEO markup.** The landing page ships `aggregateRating: 4.8 / 12 ratings` (`landing/index.html:61-66`) for a pre-launch product. Google's policy prohibits self-served ratings; this risks a rich-results penalty and looks dishonest when found.

### Ops / deployment flaws

7. **nginx caps saves at 1 MB.** The nginx config never sets `client_max_body_size`, so the server's advertised 25 MB workbook limit (`WORKBOOK_BODY_LIMIT`) is unreachable — large cloud saves silently fail at the proxy (`landing/smartsht.nginx.conf`).

8. **CSP likely breaks Clerk/Stripe.** `connect-src 'self'` in the shipped CSP may block Clerk's calls to `clerk.smartsht.com` and Stripe.js in production — auth could break at launch.

9. **Cost-control gaps.** `PUT /api/workbooks/:id` wipes and re-inserts the entire cells table on every 5-second autosave (`server/src/cellStore.ts:35-90`) — ~2000 statements for a 1M-cell sheet — behind only a global 100/min/IP limiter. No per-user limiter on save/publish/rate endpoints.

10. **DB TLS verification disabled** (`sslmode=require` with `rejectUnauthorized:false`, `server/src/db.ts:20-22`). Plus `/health` leaks provider config and raw DB/S3 errors unauthenticated (`server/src/index.ts:293-324`).

11. **Email leakage.** The public community-template listing and share-link endpoints return author email addresses (`server/src/routes/templates.ts:49-58`, `shares.ts:215-219`) — and `users.display_name` is never populated, so emails are the fallback.

### Testing blind spots

12. **Zero tests on the exact code that had the bugs.** No tests for `usage.ts`, `stripe.ts` (the hand-rolled HMAC webhook — the most fraud-sensitive path in the repo), rate limiting, providers, or any route handler. The paywall bypass and subscription-revoke bug both escaped because quota/billing have no coverage.

### Hygiene

- **Committed env files with real identifiers:** `server/.env.production` contains a real RDS hostname and S3 bucket; docs leak the EC2 IP (`52.0.207.242`); `.env.example` embeds a live Stripe price ID. Publishable keys and price IDs aren't secrets, but the DB host, bucket, and server IP are reconnaissance data in a public MIT repo.
- **Doc drift everywhere:** DEPLOY.md documents a schema that doesn't match the actual migrations; `docs/planning/25-cloud-infrastructure-plan.md` says "planning" for shipped code; ENV.md says `FREE_DAILY_LIMIT` is unused (it is used); SEO doc says OG images/CSP are missing (they exist). Also a hardcoded **test-mode Stripe price fallback** in `config.ts:173` could break live checkout if the env var is missed.
- Dead code: `src/server/api/grid-data.ts` always 401s (no auth header); duplicate usage tracking lives in both localStorage and Postgres; minor: version drift `0.1.0` vs `1.0.0`, model-name drift, orphaned `qodana.yaml`.

---

## 2. What gives it a competitive edge

1. **The Auditor is genuinely differentiated.** Range-gap detection (a SUM that skips a cell), inconsistent-formula patterns, magic numbers in formulas, statistical outliers — this is the "silent accounting error" catcher that neither Excel Copilot nor Sheets Gemini does. It runs in-browser, instantly, for free. This is your moat.
2. **The hybrid architecture is real and defensible.** ~80% of operations resolve locally via regex intent parsing with zero latency and ~$0 COGS. Your unit economics are structurally better than any pure-LLM wrapper (the $0.22/user/month cost model in the pricing doc is plausible).
3. **Action previews + reversibility.** Every AI mutation goes through a visible preview card with approve/reject, plus strong undo. This removes the #1 psychological barrier to AI editing financial data. Competitors dump text; you stage changes.
4. **Privacy-first posture.** In-browser analysis, local-first storage, BYOK, self-hostable, MIT. Directly opposes Microsoft/Google's cloud-lock-in. This is a real wedge for the open-source/self-hosted and privacy-skeptic segments.
5. **Price.** $7/mo vs. $20-30/mo for the incumbents' AI tiers. Undercuts every serious competitor.
6. **Brand voice.** "Punk-in-a-jacket" is memorable and consistent across landing, PRODUCT.md, and error copy. In a category of sterile enterprise UI, that's rare.

---

## 3. What's keeping it from having a competitive edge

- **The paywall is on the wrong thing.** Your differentiators (auditor, auto-fix, templates, cloud backup) are free; the thing you charge for is a chat-question quota — the least differentiated, most commodity feature — and it's trivially bypassable. Competitors won't copy your auditor; you're not charging for it.
- **The flagship local-AI claim is a stub.** The "loads into memory, private, instant" story (the core of your positioning in PRODUCT.md) is largely server-side LLM + regex today. If you can't demo in-browser AI, a competitor can out-narrate you.
- **No measurement loop.** No funnel analytics, no product telemetry schema, no cohort data. You can't iterate on conversion, retention, or COGS with nothing instrumented. The fabricated rating is a symptom: you have no real social proof engine either.
- **Operational immaturity that undermines trust:** the 1 MB cloud-save cap makes the top paid feature fail; the docs contradict each other; committed infra details; no staging, no CI deploy, manual SSH deploys.
- **The 3-question/day wall is a conversion killer, not a converter.** Per the paywalls playbook, you ask *after* value — 3 questions is often barely one import session. Users hit the wall before the aha moment.

---

## 4. How close to production?

**Feature-complete beta; not production-ready.** The core engineering (grid, engine, auditor, sandbox, import/export, auth, cloud storage) is genuinely launch-grade, with disciplined security habits (parameterized SQL, ownership checks on every route, LLM tool allowlisting, safe trust-proxy/CORS defaults, correct SSE handling).

Blocking you from launching are the four revenue-path issues in §1: the **paywall bypass**, the **subscription-revoke bug**, **SSRF via BYOK**, and the **nginx 1MB/CSP** issues. Those are each small fixes but they're in exactly the code that has no tests, which is why they exist. My estimate: **2–3 focused weeks** to be genuinely launch-ready (fixes + server tests for stripe/usage/providers + a deploy pipeline + analytics instrumentation), assuming the env/db/s3/keys story the user described is complete.

---

## 5. Logical next steps (priority order)

1. **Fix the revenue bugs and lock them with tests.** Gate `/api/chat`, set `subscription_data.metadata[userId]` + handle `customer.subscription.updated`, fix BYOK SSRF (block private ranges / restrict schemes on both routes), add server integration tests for these paths.
2. **Align the paywall with value.** Gate auditor auto-fix, premium templates, and cloud backup behind Pro (the pricing doc already specifies this). Keep auditor *diagnosis* free — it's the conversion hook.
3. **Instrument the funnel.** Sentry is wired; add product events: import → audit run → AI question → paywall shown → checkout → upgrade → retention. Ship a tiny events endpoint/table. You can't price, convert, or grow without this.
4. **Fix ops:** nginx `client_max_body_size`, CSP allowlist for `clerk.smartsht.com`/`api.stripe.com`, TLS verification on, sanitize `/health`, strip the fabricated `aggregateRating`, clean committed env/infra identifiers from the repo and rotate the Stripe price ID reference.
5. **Kill or honestly rebrand the NLP story.** Either bundle a real quantized in-browser model (e.g., a ~100-500MB ONNX/Qwen model — but weigh bundle size; you're using `vite-plugin-singlefile`) or stop marketing "in-browser NLP" and position the local regex + server LLM honestly.
6. **Update the stale docs** (DEPLOY.md schema, cloud plan, ENV.md, SEO doc), remove dead code, and stand up CI deploy + a staging box.

---

## 6. Pricing and paywalls

The current $7/mo single tier is the right launch move — it undercuts every competitor and matches a low-COGS architecture. Keep it, with three corrections.

**Recommended structure:**

| | Free | Pro ($7/mo) | BYOK |
|---|---|---|---|
| AI chat | 3–5/day | Unlimited | Unlimited (own key) |
| Auditor | ✅ diagnosis | ✅ + **auto-fix** | ✅ |
| Cloud backup/versioning/sharing | ❌ | ✅ | ✅ |
| Templates | 5 basic | All 50+ | All |
| Export | CSV | CSV + XLSX | CSV + XLSX |

- **Free tier:** Keep the **daily** cap (it's already implemented and correct per the plan doc), but pair it with a **7-day trial of full Pro features** — trial-first converts far better than a hard quota for a trust-based product. Auditor diagnosis free = "free diagnosis, paid prescription."
- **Pro:** $7/mo is fine for launch. Add an **annual plan at $5.8/mo ($70/yr, ~17% discount)** — improves retention and cash flow. Frame $7 as a launch rate with a struck-through $12 (already on the landing page) so you have room to raise once you have PMF and testimonials.
- **BYOK: keep it free, forever.** The pricing doc's "$2.99 BYOK platform fee" is a mistake — BYOK is your cheapest growth engine and free tier of the open-source funnel. Charge nothing; get devs as evangelists.
- **Business tier later ($19–29/mo):** multi-user/teams, shared workspaces, SSO, priority support — after PMF. Don't build it now.

**Paywall triggers** (per the paywalls playbook — ask after value, respect the no):
1. **Auditor auto-fix click** (highest conversion) — "The Auditor found 3 critical errors. Upgrade to fix them instantly."
2. **Cloud save/backup** — the natural retention hook; signed-in free users should hit this on first cloud-save attempt.
3. **XLSX export** — friction point for "I need to send this to my boss."
4. **Chat limit** — existing `UpgradePrompt`; keep the friendly voice, add a "continue with free tomorrow" escape hatch and a dismiss cooldown (days, not per-session).

**Pricing you should not do:** don't raise above ~$9–12 until you have real testimonials and the local-AI demo actually ships. Don't offer lifetime deals. Do measure COGS per paid user from real provider logs (the pricing doc's 96% margin is asserted, not measured).

---

**Bottom line:** You have a differentiated, well-engineered product whose moat (the auditor + hybrid architecture) is currently free while your paywall sits on the commodity feature and is bypassable. Fix the four revenue-path bugs, gate the right features, and instrument the funnel — then $7/mo Pro is a sound, profitable launch.
# Major Changes Log

Substantive architectural or behavioral changes that affect how the app works, deploys, or is maintained. For feature-level commit history, see `git log`.

---

## 2026-11-13 — Local Ollama fallback dropped; install dedup migration; prod cleanup

**Context:** A production review over SSH of env files, logs, the database and the local model. Changes made 2026-11-13 and 2026-11-14 (UTC).

### Ollama removed from the chat provider order (2026-11-14)
- `LLM_PROVIDER_ORDER` in production is now `groq,openrouter` (was `groq,openrouter,ollama`). It was changed in the GitHub `production` `ENV` secret and synced by the #85 deploy. The boot log shows `Provider order: groq -> openrouter`.
- The `ollama` systemd service on the box is **stopped and disabled**. This frees about 4 GB of RAM on the 8 GB `t3.large`. The GGUF and the `smartshit` model registration are kept on disk.
- **Why:** the local model could not answer within the server's 90 s Ollama timeout, so the fallback only made users wait 90 s before an error. Measured on prod (`t3.large`: 2 vCPU, 1 physical core, about 2% CPU steal, so not credit-throttled):
  - `smartshit:latest` **is** the intended model, `Spreadsheet-RL-4B.Q4_K_M.gguf` (4.4B Qwen3, Q4_K_M, 2.7 GB on disk, about 4.1 GB loaded including the 8K-context cache).
  - Its base is **Qwen3-4B-Thinking-2507**, a reasoning-only model. It reasons before every answer. `think:false`, `/no_think` and a prefilled empty `<think>` block all failed to stop it.
  - Throughput is about 2.1 to 2.5 tokens/s. A reasoned answer of a few hundred tokens takes 2 to 4 minutes, and the server gives Ollama 90 s.
  - The smallest quant in `Ocean82/Spreadsheet-RL-4B-GGUF`, Q2_K (1.8 GB), also gave no reply within 90 s with either 1 or 2 threads. Every quant in that repo has the same thinking weights. Quantization only shrinks the file, so none of them can work here.
- **Effect:** if both Groq and OpenRouter fail, chat now returns an error right away. Health and deploy are unaffected: `/health` liveness counts Ollama only when no cloud key exists, and `/health?strict=1` checks DB, S3 and Clerk. Token budgeting already targets the first cloud provider.
- **To restore later** (a bigger instance, or a non-thinking model): `sudo systemctl enable --now ollama`, then set `LLM_PROVIDER_ORDER=groq,openrouter,ollama` in the `ENV` secret and deploy. Retest the speed first. A non-reasoning model such as an Instruct build is needed on CPU-only hosts.

### Migration 007 applied: `template_installs` (2026-11-13)
- Added in #84 (`server/migrations/007_template_installs.sql`) and applied to production RDS with `npm run migrate`. The runner skipped 001 to 006.
- Each user's marketplace install now counts once toward a template's public `downloads`. Before 007 existed, the route served installs without counting them, so deploying ahead of the migration was safe.
- Verified: `smartsht.migrations` lists 007; the table has PK `(user_id, template_id)` and the index `idx_template_installs_template`.

### Malformed bearer token returns 401, not 500 (#85, 2026-11-14)
- `@clerk/express` passed a `SyntaxError` to `next(err)` for undecodable tokens such as `a.b.c`. The global handler logged "Unhandled error" and answered 500.
- `withMalformedTokenAs401` in `server/src/auth/clerk.ts` now answers 401 and records an auth denial, but only when `isUndecodableBearer` confirms the token does not decode. Other errors still reach the handler. Verified on prod: `Bearer a.b.c` → 401.
- The Groq `max_tokens` work drafted in the same PR was **dropped**. Groq's "Request too large" 429 (OTPM 1000 on the on-demand tier, while we request 2048) is intermittent, about once a week, and already falls over. Skipping or clamping Groq would have moved all chat to OpenRouter or streamed cut-off answers.

### Production `.env` backups cleaned up (2026-11-13)
- Seven old, unrotated backups in `/opt/smartsht/` were removed after being copied off-box and checksum-verified: `.env.bak-2026090*`, `-dbuser-`, `-model-`, `-rds-`, `-rename-` and `-tidy-`. The ten rotating `.env.bak-gha-*` backups made by the deploy workflow remain.
- **Follow-ups (owner):** rotate any credentials in those old files that may still be valid, then delete the archive. Move `/opt/smartsht/.rds-master.env` (RDS master credentials, not used by the app) off the box into a password manager or AWS Secrets Manager.

### Notes for the record
- Production loads `server/dist/server/.env`, a **symlink** to `/opt/smartsht/.env`. That file is written from the GitHub `ENV` secret on each deploy, so all three paths are always the same file. The repo's `server/.env.production` is a placeholder template and is not used at runtime.
- `/opt/smartsht/logs/error.log` and `out.log` date from September. Live logs are in `~/.pm2/logs/smartsht-api-*.log`. The `ERR_MODULE_NOT_FOUND …/home/ubuntu/smartsht/…` and `ollama.js … assistModelAvailable` errors there come from an old checkout that no longer exists.
- Open, not addressed: one Stripe webhook signature failure on 2026-11-05 08:03 UTC. Check Stripe's delivery log for a dropped event.

---

## 2026-08-09 — Major Review Remediation (7 Tasks)

**Context:** Systematic pass through findings in `docs/major-review.md`. All 1482 tests pass (1270 client + 212 server).

### Ollama Model Consolidation
- Removed the deprecated `smartsht-assist` model entirely (code, config, env vars, Modelfile, setup script)
- Single primary model (`smartshit`) now serves all Ollama requests with `jsonMode` support
- Production should use `Modelfile.spreadsheet-rl` (Spreadsheet-RL-4B, 4096 ctx, 768 predict)
- Dev uses `Modelfile` (Qwen2.5-Coder-1.5B for fast iteration; quality differs from prod)
- `NUM_CTX` default raised from 2048 → 4096; `NUM_PREDICT` from 512 → 768

### Sandbox Security Clarification
- Rewrote `src/sandbox/validate.ts` with explicit security model documentation
- Confirmed QuickJS VM is the real isolation boundary (allowlisted APIs only)
- Regex pre-check is documented as defense-in-depth for UX, not as the security perimeter
- Resource limits remain enforced: 5s timeout, 16MB memory, 50K mutations max

### Stripe & Workbook Route Tests
- Added `server/src/stripe.test.ts` — 21 tests (signature verification, replay protection, event routing)
- Added `server/src/routes/workbooks.test.ts` — 18 tests (auth 401, ownership 403, not found 404, happy paths)
- Installed `supertest` dev dependency for HTTP route testing

### Share Permission UI Cleanup
- `ShareDialog.tsx`: Existing shares list always shows "View only" (no more "Can edit" badge for legacy records)
- `SharedView.tsx`: Same fix for shared workbook header
- Server already rejects `permission === 'edit'` with 400 (done previously)

### Agent Parser False-Positive Fixes
- Created 65-test corpus in `src/agent/__tests__/parserFalsePositives.test.ts`
- Fixed 6 real false-positive mutation bugs:
  - Added question-prefix guard (sentences starting with "can I", "should I", etc. → no instant mutation)
  - Added vague-reference guard ("delete that one", "remove it" → no match as row target)
  - Expanded `NON_ROW_DELETE_TARGETS` with border, background, color, style, highlight, conditional, rule
  - Added `COMMON_WORDS_NOT_COLUMNS` set (prevents "sum vs" from matching as "sum column VS")
  - Added educational guard (phrases with "explain", "vs", "compare" skip formula patterns)
- Zero regressions across all 136 existing agent tests

### Free-Tier Drift Detection
- Added `src/lib/featureGates.test.ts` to catch client/server free-tier limit divergence in CI
- Constants currently aligned at 10 (client `featureGates.ts`, `useUsage.ts`, server `usage.ts`)

**Files deleted:**
- `server/Modelfile.excel-assist`
- `scripts/setup-assist-model.ps1`

**Dependencies added:**
- `supertest` + `@types/supertest` (server devDependencies — HTTP route testing)

**Deployment note:**
After deploying, recreate the Ollama model on the server using the correct Modelfile:
```bash
ollama create smartshit -f server/Modelfile.spreadsheet-rl
```

---

## 2026-08-03 — XLSX Import Overhaul

**What changed:**
- `src/io/xlsx.ts` rewritten to use `raw: true` (preserves native types) and `cellFormula: true` + `cellStyles: true` options.
- Formulas are extracted directly from `rawCell.f` instead of relying on `sheet_to_json` string output.
- Excel's pre-computed values (`rawCell.v`) are preserved alongside formulas as fallback display values.
- Number format strings (`rawCell.z`) are mapped to the app's internal format keys (`percent`, `currency`, `number-int`, etc.).
- Background colors extracted from `rawCell.s.fill.fgColor` / `bgColor`.
- Borders extracted from `rawCell.s.border` (limited by xlsx community edition).

**Why:**
- Previous import used `raw: false` which converted numbers to formatted strings (e.g., `"114,658"`). Formulas doing arithmetic on those strings produced cascading `#VALUE!` errors.
- Percentages stored as decimals (0.14) displayed as `0.14` instead of `14%` because number format wasn't imported.

**Dependencies:**
- `xlsx@0.19.3` (community edition, npm). Full style extraction requires the Pro/CDN version which isn't on npm. Border extraction is best-effort.

**Known limitations:**
- `cellStyles: true` doesn't reliably populate `.s` on all cell objects in the community edition. Borders and fonts may not import from all xlsx files.
- The app's formula engine (`@ocean8219/formualizer`) doesn't implement all Excel functions. Cells with unsupported functions display the Excel-computed value (static) rather than live-recalculating.

---

## 2026-08-03 — Mouse Selection & Keyboard Scroll

**What changed:**
- `src/components/grid/SelectionManager.tsx`: Added `isDragging` ref. Mouse-move selection only extends while the primary button is held (fixes phantom drag after click).
- `src/components/SpreadsheetGrid.tsx`: Added `scrollCellIntoView` callback that programmatically scrolls the grid when arrow-key navigation moves past the visible viewport.

**Why:**
- Users reported that after clicking a cell, moving the mouse (without holding) would continue to extend the highlight selection.
- Arrow-key navigation past the bottom or right edge of the viewport didn't scroll, making keyboard-only use impractical.

---

## 2026-08-03 — Design System Polish Pass

**What changed:**
- 13 components migrated from hardcoded Tailwind color classes (`text-gray-900`, `bg-blue-600`) to OKLCH CSS custom properties (`var(--ink-primary)`, `var(--accent-600)`).
- All dialogs now use unified backdrop (`oklch(0.1 0.02 250 / 0.5)` with blur), consistent shadow scale, and proper ARIA roles (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
- Mobile accessibility: touch targets enlarged to 40px minimum, `motion-safe:` prefix on animations, keyboard activation (Enter/Space) on sheet tabs.

**Files affected:**
`ConditionalFormatDialog`, `FilterDialog`, `ContextMenu`, `CommandPalette`, `AuditFindingCard`, `ValidationDialog`, `GoToCellDialog`, `FormulaBar`, `SheetTabs`, `StatusBar`, `WelcomeOverlay`, `MobileMenu`, `MobileToolbar`

---

## 2026-08-03 — ESLint & TypeScript CI Fixes

**What changed:**
- Resolved all 12 ESLint errors/warnings (unused vars prefixed with `_`, `prefer-const`, stale disable directives).
- Fixed `TS2322` in `hybridRouter.test.ts` — mock return types now use `satisfies UserIntent` to prevent `intentType` widening from `IntentType` to `string`.

**Infra note:**
- CI runs `tsc --noEmit` before `vite build`. TypeScript errors in test files block the build even though tests run separately via Vitest.
- The `@typescript-eslint/no-unused-vars` rule requires unused parameters to match `/^_/u`.

---

## Responsive Breakpoint Convention

The mobile/desktop breakpoint is **768px**, matching Tailwind's default `md:` prefix.

- **CSS:** `@media (max-width: 768px)` in `index.css`, `Toast.css`
- **Tailwind:** `md:` / `max-md:` utility classes throughout components
- **JS constant:** `src/lib/layoutConstants.ts` exports `MOBILE_BREAKPOINT = 768` for any future runtime checks

If this value needs to change, update all three locations. A comment in `index.css` references the constant file.

---

## Infrastructure & Deployment

**Server:** Ubuntu on AWS EC2 (`52.0.207.242`), nginx reverse proxy, PM2-managed Node API on port 8787.

**Deploy process (manual):**
```bash
ssh ubuntu@52.0.207.242
cd /home/ubuntu/smartsht/app
git pull --ff-only origin main
npm install
npx vite build
sudo cp dist/index.html /var/www/smartsht/app/index.html
```

**Nginx config:** `/etc/nginx/sites-enabled/smartsht.conf`
- `/app` → SPA (`try_files` to `index.html`)
- `/api/` → proxy to `127.0.0.1:8787`
- `/shared/` → rewrite to SPA for shared workbook links
- SSL via Let's Encrypt (auto-renew)

**What's NOT automated:**
- No CI/CD pipeline deploys to production automatically. Push to `main` triggers GitHub Actions (lint + build check) but deploy is manual SSH.
- No staging environment. Changes are verified locally then deployed directly.
- No database migrations runner. Schema changes to the PostgreSQL database (cloud workbooks, usage tracking) are applied manually. *(Superseded: `server/scripts/run-migration.mjs` (`npm run migrate`) now tracks applied files in `smartsht.migrations`; still run by hand after deploy. Noted 2026-11-13.)*

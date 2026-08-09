# Major Changes Log

Substantive architectural or behavioral changes that affect how the app works, deploys, or is maintained. For feature-level commit history, see `git log`.

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
- No database migrations runner. Schema changes to the PostgreSQL database (cloud workbooks, usage tracking) are applied manually.

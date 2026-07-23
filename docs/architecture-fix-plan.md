# Architecture & Quality Fix Plan

Issues identified from the SmartSht review, verified against the actual codebase. Ordered by severity and dependency (foundational fixes first).

---

## Phase 1: Critical Safety & Stability ✅ COMPLETE

### 1.1 Add React Error Boundary ✅

**Problem:** Zero error boundaries. Any uncaught error renders a white screen.

**Fix:**
- [x] Create `src/components/ErrorBoundary.tsx` — class component with `componentDidCatch`
- [x] Wrap `<App />` in the boundary at the root
- [x] Add a user-friendly fallback UI with "Reload" button
- [x] Add a secondary boundary around `<SpreadsheetGrid />` (most complex component)

**Effort:** Small (1-2 hours)

---

### 1.2 Add Server Request Validation ✅

**Problem:** No schema validation on incoming requests. The `/api/chat/stream` endpoint only checks `if (!userMessage)` — malformed `context`, `history`, or `sheetData` payloads could crash the server or produce garbage.

**Fix:**
- [x] Install `zod` (already a common pattern in TS servers)
- [x] Create `server/src/schemas/` directory with schemas for each endpoint body
- [x] Validate `/api/chat/stream` body: `message` (string, required), `history` (array of {role, content}), `context` (optional structured object), `forceLlm` (boolean)
- [x] Validate `/api/ai-function` body: `function` (string), `args` (object)
- [x] Return 400 with structured error messages on validation failure
- [x] Add validation to Stripe webhook signature check (already partially done)

**Effort:** Medium (3-4 hours)

---

### 1.3 Add Rate Limiting to Chat Endpoints ✅

**Problem:** `/api/chat/stream` and `/api/chat` have no rate limiting. The existing usage gate (daily message count for free tier) is a business limit, not abuse protection. An attacker can spam the endpoint and rack up LLM costs.

**Fix:**
- [x] Install `express-rate-limit`
- [x] Add rate limiter middleware to `/api/chat/stream` — e.g., 20 requests/minute per user
- [x] Add rate limiter middleware to `/api/chat` — same limits
- [x] Add a stricter global limiter for unauthenticated endpoints (health excluded)
- [x] Return proper 429 responses with `Retry-After` header

**Effort:** Small (1-2 hours)

---

## Phase 2: Performance

### 2.1 Replace Full-Snapshot Undo with Diff-Based History ✅

**Problem:** Each undo entry is `JSON.stringify(entireWorkbook)`. A workbook with 5,000 cells with formatting = ~1-2MB per snapshot × 50 stack entries = 50-100MB in memory. CPU spikes on stringify/parse during undo/redo.

**Fix:**
- [x] Create `src/lib/historyDiff.ts` — compute JSON patch (RFC 6902) between workbook states
- [x] Install `fast-json-patch` or implement minimal cell-level diffing
- [x] Change `HistoryEntry` from `{ workbook: string }` to `{ patch: Operation[], inversePatch: Operation[], description: string }`
- [x] On `pushHistory`: compute forward patch from previous state
- [x] On `undo`: apply inverse patch to current workbook
- [x] On `redo`: apply forward patch
- [x] Keep one full "base snapshot" at the bottom of the stack for recovery
- [x] Update stack cap logic (can increase from 50 since patches are tiny)

**Effort:** Large (6-8 hours)

---

### 2.2 Add Code Splitting / Lazy Loading ✅

**Problem:** App.tsx imports 35+ components statically. Every dialog, panel, overlay, and debug tool loads eagerly in the initial bundle — even if the user never opens them.

**Fix:**
- [x] Wrap infrequently-used components in `React.lazy()` + `<Suspense>`:
  - `TemplateGallery`
  - `CommandPalette`
  - `ChartDialog`
  - `ValidationDialog`
  - `PivotDialog`
  - `FilterDialog`
  - `ConditionalFormatDialog`
  - `ShareDialog`
  - `GoToCellDialog`
  - `VersionHistoryPanel`
  - `WorkbookPicker`
  - `TelemetryDebugPanel`
- [x] Add lightweight `<Suspense fallback>` spinners for each lazy component
- [x] Verify Vite/Rollup produces separate chunks (check build output)

**Effort:** Medium (2-3 hours)

---

### 2.3 Improve Conditional Formatting Memoization ✅

**Problem:** `useMemo` for peer values depends on `[sheet, getComputedValue]` — since `sheet` is a new reference from immer on every cell change, the memoization busts on every keystroke. All color scales, data bars, and icon sets recompute even if unrelated cells changed.

**Fix:**
- [x] Extract conditional formatting peer computation into a selector with fine-grained deps
- [x] Use a stable hash of the cells that actually participate in conditional rules (e.g., only cells in columns with rules)
- [x] Alternatively: move to `zustand` subscriptions with `shallow` equality for just the cells in rule columns
- [x] Add `React.memo` to the cell renderer component to prevent re-renders of cells without format changes

**Effort:** Medium (3-4 hours)

---

## Phase 3: Architecture

### 3.1 Decompose the God Store ✅ (Phase 1 Complete)

**Problem:** 1,614-line single store mixing workbook mutations, AI orchestration, file management, clipboard, UI state, undo/redo, toasts, and validation in one flat namespace. The `sendMessage` action alone is ~150 lines of async orchestration.

**Fix:**
- [x] Extract `sendMessage` + AI logic into `src/services/chatService.ts` — pure async function that takes state getters and returns results, no store coupling
- [x] Create `src/store/slices/uiSlice.ts` — panel visibility, scroll state, dialogs, toasts, confirmations
- [x] Create `src/store/slices/fileSlice.ts` — file state types (prepared for future full extraction)
- [x] Integrate UI slice into main store via composition (spread state + actions)
- [ ] Create `src/store/slices/workbookSlice.ts` — cell mutations, sheet management, undo/redo (future)
- [ ] Create `src/store/slices/chatSlice.ts` — messages, chatInput, isProcessing, pinned (future)
- [ ] Update component imports to use specific slice selectors (future — reduces unnecessary re-renders)

**Effort:** Large (8-12 hours)

---

### 3.2 Decompose SpreadsheetGrid ✅ (Phase 1: Extract Cell Renderer)

**Problem:** ~1,008-line component handling 15+ distinct responsibilities. Impossible to test individual behaviors, optimize rendering, or onboard new developers.

**Fix:**
- [x] Extract `src/components/grid/GridCell.tsx` — memoized cell renderer with all visual states (conditional formatting, data bars, color scales, icon sets, editing, validation, checkboxes, notes, pending AI changes)
- [x] `React.memo` on GridCell — prevents re-render when only unrelated cells change
- [x] Remove 160+ lines of inline JSX from SpreadsheetGrid (now 846 lines, down from ~1,008)
- [ ] Extract `src/components/grid/SelectionHandler.tsx` — mouse/touch/keyboard selection logic (future)
- [ ] Extract `src/components/grid/CellEditor.tsx` — inline editing, formula input, autocomplete (future)
- [ ] Extract `src/components/grid/ColumnResizer.tsx` — resize handles, auto-fit logic (future)
- [ ] Extract `src/components/grid/GridKeyboardHandler.ts` — keyboard shortcut mapping (future)
- [ ] Extract `src/components/grid/TouchHandler.tsx` — tap, long-press, drag-select for mobile (future)

**Effort:** Large (6-10 hours)

---

## Phase 4: Quality & Testing

### 4.1 Add Integration Tests for Critical Paths

**Problem:** 29 test files all cover simple utility functions. Zero tests for the AI chat flow, store orchestration, auditor end-to-end, or import/export.

**Fix:**
- [ ] Add `src/store/__tests__/sendMessage.integration.test.ts` — test the full local parser → tool execution → response flow (mock server, real store)
- [ ] Add `src/auditor/__tests__/auditor.integration.test.ts` — test full audit run against a fixture workbook (all 10 rules)
- [ ] Add `server/src/__tests__/chat.integration.test.ts` — test `/api/chat/stream` with mocked LLM provider (supertest)
- [ ] Add `src/io/__tests__/xlsx.integration.test.ts` — round-trip import/export test with a real .xlsx fixture
- [ ] Add `server/src/__tests__/validation.test.ts` — test request validation rejects malformed input

**Effort:** Medium-Large (6-8 hours)

---

### 4.2 Add Error Reporting

**Problem:** Production errors are invisible. No telemetry on crashes, unhandled rejections, or failed AI calls.

**Fix:**
- [ ] Add Sentry (or equivalent) to the client: `Sentry.init()` in main.tsx
- [ ] Wrap error boundary with `Sentry.captureException()`
- [ ] Add Sentry to the server: catch unhandled rejections and express error middleware
- [ ] Tag errors with user context (anonymous ID, plan tier, workbook size)
- [ ] Add breadcrumbs for key actions (send message, import file, undo/redo)

**Effort:** Small-Medium (2-3 hours)

---

## Phase 5: Accessibility

### 5.1 Grid ARIA Semantics

**Problem:** The grid has `tabIndex={0}` and keyboard nav but zero ARIA roles. Screen readers cannot interpret the spreadsheet structure.

**Fix:**
- [ ] Add `role="grid"` to the grid container
- [ ] Add `role="row"` to each rendered row
- [ ] Add `role="columnheader"` to column headers, `role="rowheader"` to row headers
- [ ] Add `role="gridcell"` to each cell
- [ ] Add `aria-colindex`, `aria-rowindex` to each cell
- [ ] Add `aria-selected="true"` to selected cells
- [ ] Add `aria-readonly` where cells are not editable
- [ ] Add a live region (`aria-live="polite"`) for announcing selection changes and action results
- [ ] Test with VoiceOver/NVDA

**Effort:** Medium (4-5 hours)

---

## Phase 6: Future (Not Blocking v0.2)

These are acknowledged gaps that don't need immediate fixes:

- [ ] **Collaboration / real-time co-editing** — Requires Yjs/CRDT infrastructure. Acknowledged in roadmap.
- [ ] **Offline/PWA strategy** — Service worker exists but AI features need server. Low priority until user base grows.
- [ ] **i18n** — English-only is fine for current market. Extract strings when internationalizing.

---

## Execution Order (Recommended)

| Priority | Items | Why First |
|----------|-------|-----------|
| Week 1 | 1.1, 1.2, 1.3 | Stability and security fundamentals |
| Week 2 | 2.1, 2.2 | Performance wins users notice immediately |
| Week 3 | 3.1 | Unlocks testability and reduces bugs for everything after |
| Week 4 | 4.1, 4.2 | Catches regressions from refactoring |
| Week 5 | 3.2, 2.3 | Grid decomposition + fine-grained rendering |
| Week 6 | 5.1 | Accessibility compliance |

---

## Notes

- **Don't tackle collaboration yet.** The review correctly identifies it as important for adoption, but it requires CRDT infrastructure that's a multi-month effort. Ship quality/performance first.
- **Store decomposition (3.1) is the highest-leverage refactor.** Once the store is sliced, testing becomes possible, re-renders decrease, and new features are easier to add without regression.
- **Error boundaries (1.1) should be the very first commit.** It's 30 minutes of work and prevents white-screen crashes in production.

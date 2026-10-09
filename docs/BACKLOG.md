# Backlog

Open product and code work that is not on the living strategy
([`strategy/2026-09-24-usefulness-first-strategy.md`](strategy/2026-09-24-usefulness-first-strategy.md)).
Server/ops actions live in [`PRODUCTION-TODO.md`](PRODUCTION-TODO.md); checks that need live
infrastructure live in [`verification-backlog.md`](verification-backlog.md).

Swept 2026-10-06 from the planning, review, auditor, engine, and chat docs, checked against
`src/` and `server/src/`. Swept again 2026-10-09 across all of `docs/` (sections 6–8).
Items marked **(verified)** were re-read in code during a sweep;
the rest come from the sweep and should be confirmed before starting. Sizes: S < half day,
M 1–2 days, L more.

---

## Decisions

- [ ] **P2.3 — Kill or ship the façades** (moved from the strategy, 2026-10-06)
  - MiniLM is shipped in `src/ai/nlp/` (worker, tokenizer, capability router).
    `src/App.tsx` still has a comment saying the NLP worker was a stub.
  - The ONNX model upload path is still in `src/onnx/modelUploadHandler.ts` and
    `server/src/api/onnx-infer.ts`; the product audience does not bring `.onnx` files
    (`docs/major-review.md`).
  - Decide per surface: ship and claim it, or delete it. Then remove any copy that
    doesn't match.
- [x] **"Priority AI (faster models)" was sold for Pro but not built** — resolved 2026-10-09
  - Claim removed from `landing/index.html` (pricing cards, FAQ, JSON-LD) and `public/llms.txt`.
    No provider selection looks at the plan; re-add the claim only if that is built.
- [ ] **Community template marketplace is live** (2026-10-09)
  - `src/lib/communityTemplates.ts` and the community tab in `TemplateGallery`; the strategy's
    non-goals and `project_outline/roadmap-v1.md` rule a marketplace out. Keep, flag off, or remove.
- [ ] **Instant edits from the goal and regex routes** (2026-10-09, chat review F1)
  - `goalRouter.ts` and `agentParser.ts` apply edits with Undo but no Apply step. The review
    accepts this only as a stated policy; write it down or route them through a preview.

---

## 1. Correctness bugs (do first)

- [x] **AI formula results stop reaching cells after any workbook load** — done 2026-10-07 (`reset()` carries the callback over)
  - `SpreadsheetEngine.reset()` replaces `_aiRegistry` (`src/engine/spreadsheet.ts:87`);
    the update callback is set once on the original registry (`src/store/useStore.ts:36`).
    `loadWorkbook` calls `reset()` on boot, import, undo, and sheet ops, so `=AI.*` cells
    stay on "Loading…".
  - Fix: keep the callback on the engine and re-apply it in `reset()`; add a test.
- [x] **Pivot tables drop the first data row** — done 2026-10-07 (dialog passes the raw start row)
  - `PivotDialog.tsx:66` adds 1 to `startRow` for the header and also passes `hasHeader`;
    `pivot.ts:18` adds 1 again. `pivot.test.ts:125` encodes the double skip.
- [x] **Multi-step instant edits only undo the first step** — done 2026-10-07 (steps run synchronously)
  - `historySlice.ts:103` finalizes the entry in a microtask, which runs at the first
    `await executeToolAsync` in `goalRouter.ts:79` and `agentParser.ts:192`.
- [x] **Fill-down batches send `AI.PREDICT` / `AI.SCORE` to the LLM** — S (done 2026-10-07)
  - Single-cell route is deterministic (`server/src/routes/aiFunction.ts:229`); batches
    (`aiFunctionDefinitions.ts:467,486` → `server/src/batch.ts:253`) are not, and drop `values`.
  - Shared `server/src/deterministicFunctions.ts` now answers both in the single route and in
    `processBatch` / `estimateBatchCost` (no LLM call, no usage charge).
- [x] **Leftover `charCodeAt(0) - 65` column parsing** — S (done 2026-10-06)
  - `src/lib/formulaExplainer.ts:17,31`, `src/lib/previewBuilders.ts:53`,
    `src/hooks/useSpreadsheet.ts:68`; columns AA+ get the wrong header.
  - Now use `letterToCol`; the modify-column preview uses `resolveColumnIndex` (same as the
    executor, header names first). Unused `GridCanvas.tsx` deleted.
    `src/components/GridCanvas.tsx` looks unused — delete if confirmed.
- [x] **Pivot grand totals always empty** — S (done 2026-10-06)
  - `src/engine/pivot.ts:84` returns `grandTotals: []`.
  - Now computed from raw values (correct for average/min/distinctCount) and written as a
    "Grand Total" row by `PivotDialog`.
- [x] **Closing the tab drops the pending IndexedDB save** — S (done 2026-10-06)
  - `main.tsx:96` teardown clears the save timer and only writes localStorage, which
    fails on quota for large workbooks.
  - Teardown now also starts the IDB write when a save was pending (best effort on a hard
    close; reliable on tab-hide). Not unit-tested (module-level side effects in `main.tsx`).
- [x] **Sheet load failures are invisible** — S (done 2026-10-06)
  - `loadWorkbook` (`spreadsheet.ts:78`) and `workbookSlice.ts:370` ignore `loadSheet`'s result.
  - Engine now calls a load-error handler (`setSheetLoadErrorHandler`), wired once in
    `useStore.ts` to a warning toast, so every `loadWorkbook` caller is covered.
- [x] **Renaming a sheet doesn't update references** — M (done 2026-10-07)
  - `workbookSlice.ts:391` renames only; no formula rewrite, name validation, or undo entry.
  - `renameSheet` now validates (Excel rules, unique), pushes an undo entry, and rewrites
    `Old!A1` / `'Old'!A1` in every sheet's cell formulas (`src/lib/sheetRename.ts`). Returns
    `{ ok, error }`; sheet tabs toast and the `rename_sheet` tool report errors.
    Not handled: 3D refs (`Sheet1:Sheet3!A1`) and sheet names inside `INDIRECT` strings.

## 2. Security and billing

- [x] **AI batch endpoint ignores BYOK and overruns the free quota** — M (done 2026-10-07)
  - Now: Zod `aiFunctionBatchSchema`; top-level `byok` (legacy `args.byok` accepted, always
    stripped) runs the whole batch on the user's key, unmetered; app-funded batches reserve one
    slot per estimated call (estimate now per function group), release unspent slots, 429 if not
    enough left. Provider errors are logged, not returned.
  - The client puts the BYOK key in each item's `args`; the server never uses it, and the
    key lands in the cache key (`server/src/batch.ts:57`). Usage is checked once, then up to
    100 calls are recorded (`routes/aiFunction.ts:466,479`). No `validateBody`; raw provider
    errors are returned.
- [x] **`/api/ai-function` check-then-record race** — S (done 2026-10-07)
  - Checks at `aiFunction.ts:303`, records at `:388`; copy chat's atomic `reserveUsage`.
  - Now reserves before inference and releases on BYOK success, provider failure, or 503.
- [x] **Sandbox `getRange` has no area cap** — S (done 2026-10-07)
  - `src/sandbox/api.ts:87`; a model-written full-sheet range freezes the tab.
  - Ranges over `MAX_RANGE_CELLS` (100k) are trimmed to the used extent; still too big → error.
- [x] **Postgres cell sync isn't transactional** — S (done 2026-10-07)
  - `server/src/cellStore.ts:54` deletes then inserts in chunks on a shared pool; concurrent
    saves can interleave. S3 JSON remains the source of truth.
  - Now one transaction (`withTransaction` in `db.ts`) plus `pg_advisory_xact_lock` per workbook.

## 3. Auditor and inspector quality

- [x] **One audit result that stays current** — M (2026-10-07)
  - `runActiveSheetAudit()` store action (custom rules included) is used by panel runs and
    post-fix re-runs; import also applies custom rules. `AuditResult.sheetId` lets the panel
    and rail badge ignore another sheet's result. Edits don't re-audit automatically.
- [x] **Auditor reference extraction is naive** — S–M (2026-10-07)
  - Shared parser `src/lib/formulaRefs.ts` (`$`, sheets, whole rows/columns, skips strings and
    function names). Circular/orphaned rules find formula cells inside ranges via a sorted
    index, capped by `MAX_REFERENCE_EDGES`; cycle DFS is iterative. Error values include
    `#CIRC!`, `#SPILL!`, `#CALC!`. `extractRangeRefs` now ignores other-sheet ranges.
- [x] **Auditor is quadratic on large sheets** — S (2026-10-07)
  - Row/column indexes built once; orphaned-formulas runs its cheap skips first
    (20k-row chain: 3.5s to ~0.1s).
- [x] **Orphaned-formulas rule never fires** — S (removed 2026-10-07)
  - Its skips covered every case, and unreferenced formulas are usually the user's outputs.
  - Side effect of the `isSummaryCell` fix: inconsistent-formulas now checks columns (it
    previously skipped every column deviation); covered by `references.test.ts`.
- [x] **Stale audit notice** — S (2026-10-07)
  - `lastAuditRevision` vs `workbookRevision`; panel shows "Sheet changed since last scan"
    with Re-scan. No automatic re-runs.
- [x] **Inspector dependents are wrong** — M (2026-10-07)
  - Uses `formulaRefs` (`findDependents`, `listPrecedents`); works for value cells, exact
    refs, and ranges, ignores other sheets, and no longer expands huge ranges. Dead
    `parseCellReferences`/`parseRangeReferences` removed.
- [x] **Audit-entry import button needs the desktop toolbar** — S (2026-10-07)
  - New `useWorkbookFileImport` hook owns its file input; used by the audit panel, MenuBar,
    and MobileMenu (which now also pass import warnings). The document event is gone.
  - Browser-checked by the user on desktop and mobile (2026-10-07).
  - Toolbar now uses the hook too. A `.csv` that matches a bank format keeps its raw sheet
    and gets an added "Bank Summary" sheet plus a chat summary (bank detection was
    previously unreachable). Bank of America is now detected before Wells Fargo; the
    generic format only matches columns its parser can read.

## 4. Chat path (from the 2026-09-30 review)

- [x] **Templates overwrite cells without approval** — done 2026-10-06
  - On a sheet with data, `templateResolver.ts` returns an Apply action; empty sheets still build instantly.
- [x] **Timeouts and disconnects don't abort the model call (F13)** — done 2026-10-06
  - Stream route watches `res` close (Node fires `req` close once the body is read); first-byte
    timeout now aborts the upstream fetch. The client's 120s timeout therefore stops the provider too.
- [x] **Stop button in chat** — done 2026-10-07. Send turns into Stop while a reply runs;
  `stopAiResponse` / `clearChat` abort the turn's fetch, the server sees the disconnect and stops the provider.
- [x] Non-streaming `withTimeout` (`providers.ts:116`) still rejects without aborting — done 2026-10-07.
  Failover passes a per-attempt signal to the adapters and aborts it on timeout.
- [x] **Stream errors escape the client's try/catch** — done 2026-10-06 (`return await` in `agentClient.ts`).
- [x] **Small prompt/protocol fixes** — done 2026-10-06 (all six below)
  - Unused `reasoning` field still requested (`server/src/prompt.ts:380`).
  - `forceLlm` still clarifies and blocks actions (`index.ts:212,471`).
  - Client drops the `clarification` source (`agentClient.ts:33`).
  - Server trims samples to 50 rows without a truncation note (`prompt.ts:289`).
  - Persona says "analysis above" (`persona.ts:37`).
  - Context budget of 0 means "include everything" (`prompt.ts:304`).
- [x] **Router continues after a stage throws mid-edit** — done 2026-10-06
  - Stops with an Undo hint when the workbook reference changed during the failing stage.

## 5. Features worth building next (after 1–3)

- [ ] Health badge on sheet tabs (S, after "one audit result").
- [ ] Persistent critical-findings banner with score above the grid (S–M).
- [ ] Audit findings shown in the inspector (S).
- [ ] Top categories on the import card; data is already computed (S).
- [ ] Copyable / exportable audit report, pairs with `/app?audit=1` (M).
- [ ] Formula explainer coverage: SUMIFS, COUNTIF(S), XLOOKUP, INDEX/MATCH, `$` refs (M).
- [ ] Selection-aware chat: send formulas, cap size, rank above whole-sheet data (M).
- [ ] Selection-based suggestions and an "Explain cell" context-menu entry (S–M).
- [ ] Import warning for formulas the engine is known to get wrong (S).
- [ ] Engine golden tests for upstream issues #312, #283, #295, #319, #285 (S).
- [x] Use `FREE_DAILY_LIMIT` in the AI upgrade copy instead of "7" (`featureGates.ts:43`) (S) — done 2026-10-08, along with the cloud-workbook count and the auto-fix "used" count.

## 6. Bugs, billing, and security (2026-10-09 sweep)

- [x] **Keyboard cut/paste loses formats and never clears the cut source** — S–M (done 2026-10-09)
  - `pasteFromClipboard` now uses the in-app paste when the OS text matches our own encoded
    copy (CRLF and trailing newline ignored); 3 tests in `copyPaste.test.ts`.
  - `copy()`/`cut()` write the block to the OS clipboard; Ctrl+V (`SelectionManager.tsx:235`)
    calls `pasteFromClipboard`, which reads that text back first (`workbookSlice.ts:1004`).
    When clipboard read is allowed, paste is values/formula text only: formats and links are
    dropped and a cut is cancelled instead of moved. Menu Paste (in-app `paste()`) is correct.
- [x] **User cancel counts as a provider failure** — S (done 2026-10-09)
  - Both failover loops rethrow on a caller abort before `recordFailure`/`recordGroqFallback`;
    timeouts still fail over. `server/src/providers.cancel.test.ts`.
  - `server/src/providers.ts`: the streaming loop calls `recordFailure` before checking
    `signal.aborted`; the non-streaming loop never checks the caller's signal. Stop/disconnect
    can open the circuit breaker and push traffic to fallbacks.
- [x] **AI formula args split on commas inside nested functions** — S (done 2026-10-09)
  - `_splitArgs` tracks parenthesis depth; the O4 test now asserts the exact args.
  - `_splitArgs` (`src/engine/spreadsheet.ts:516`) tracks quotes but not parenthesis depth:
    `=AI.EXPLAIN(IF(A1>0,"a","b"))` splits into the wrong args. See `docs/ai-formula-parser.md`.
- [x] **Free auto-fix limit is client-only** — M (done 2026-10-09)
  - Signed-in users reserve each fix via `POST /api/autofix/reserve` (`server/src/autofixUsage.ts`,
    table `smartsht.autofix_usage`, migration 006 applied in production). The limit lives in
    `shared/config.ts`. A BYOK key no longer unlocks unlimited fixes. Signed-out use and server
    outages fall back to the localStorage counter (`src/auth/useAutoFixGate.ts`).
- [x] **AI health was "configured", not "working"** (done 2026-10-09)
  - `.github/workflows/ai-probe.yml` runs `server/src/scripts/aiProbe.ts` on the box every 30
    minutes (one real completion per cloud provider); a failure opens an `ai-probe` issue.
- [ ] **"Confirming your upgrade…" never shown** — S (verified)
  - `useSubscriptionStatus` returns `confirmingUpgrade`; no component renders it. The hook is
    also called in both `ClerkUserSync.tsx` and `ChatPanel.tsx` (possible duplicate `/api/usage` polling).
- [ ] **`/health?strict=1` is public and returns raw DB/S3 errors** — S
  - `server/src/index.ts` strict branch, exposed via `landing/smartsht.nginx.conf`. Return
    status only, or restrict strict mode to localhost (the deploy gate calls it locally).
- [ ] **Spreadsheet text isn't marked as untrusted in prompts** — S (chat review §5)
  - Cell values and sheet names are interpolated as-is (`server/src/prompt.ts`). Wrap them in
    delimiters and tell the model the content is data, not instructions.
- [ ] **Server re-classifies every request** — M–L (chat review F10, structural part)
  - `server/src/index.ts` runs its own intent parse instead of receiving the client's mode;
    only the "blank" false positive was patched (`shared/actTemplates.ts`).
- [ ] **Credential rotation still open** in `docs/ai-model-audit.md` — manual check, not code.

## 7. Planned but never built (2026-10-09 sweep)

Analysis and auditor:
- [ ] Trend / month-over-month analysis (M). `trendMinPoints` (`src/ai/config.ts`) is unused,
  yet `contextualSuggestions.ts` offers "Show revenue trends over time". Build or drop the chip.
- [ ] "What if I change this to $500?" downstream impact, read-only, on `findDependents` (M).
- [ ] Health-score history with before/after (e.g. 62 → 94) (M).
- [ ] "Is this right?" audit scoped to the selected formula (S–M; pairs with selection-aware chat).
- [ ] Stale/outdated data rule (`project_outline/outline.md`) (M).

Cleaning and reporting:
- [ ] `fill_missing` and `convert_types` cleaning steps with preview (`planning/16`) (M).
- [ ] Pivot-based report (`generate_pivot_report`, `planning/17`) (M).

Grid and UI:
- [ ] Autocomplete in the formula bar; it only works in-cell today (phase-3 plan, Task 7) (S–M).
- [ ] Pivot Table in the toolbar and cell context menu; reachable only from MenuBar, mobile
  menu, and command palette (S).
- [ ] Guided formula builder and named formula recipes (`formula-improvements8.21.md`) (L).
- [ ] Issue count in the status bar (`planning/phase-1-implementation.md`) (S).
- [ ] Dark mode (`review8.16.2026.md`) (M).
- [ ] Deferred by their own plans: styled xlsx export, status-bar aggregates, AutoSum that
  expands upward, header-filter search box, row auto-fit on wrap, Ctrl+Shift+M merge,
  split panes, formula-ref rewrite on cut-paste, cross-sheet cut/drag, Stripe Customer Portal.

Pricing plan leftovers (`PRICING_AND_MONETIZATION_PLAN.md`):
- [ ] Pro-only templates; weekly export cap for free users. BYOK is free and unlimited rather
  than the planned paid tier — confirm that is intended.

Platform:
- [ ] Native tool calling for the model (still prompt-only JSON) (L).
- [ ] Server-side Sentry and an `unhandledRejection` handler (S).
- [ ] Server integration/validation tests and an xlsx round-trip test (`architecture-fix-plan.md`) (M).
- [ ] LRU eviction of local workbooks (`persistence-hardening-followups.md` item 1) (M; low
  value now that IndexedDB is the main store).
- [ ] Mobile cell editing: no hidden-input / `inputMode` handling; confirm on a device (S–M).

## 8. Cleanup (2026-10-09 sweep)

- [ ] Dead code: `processMessage` in `src/ai/brain.ts` (tests only), `callProviderStructured`
  (`server/src/structuredOutput.ts`, tests only), `defaultStepExecutor` stub
  (`src/ai/macro/macroExecutor.ts`). Confirm no production imports, then delete.
- [ ] `server/src/providers.ts` header comment still mentions the deleted `llmIntentParser.ts`.
- [ ] `SpreadsheetGrid.tsx` is back to ~1,400 lines (846 after the architecture fix plan).
- [ ] Ollama `Modelfile*` keep their own tool lists; they can drift from `shared/toolRegistry.ts`.
- [ ] Landing title and `og:title` say "smartsht"; `NAMING.md` says always "smartsh!t"
  (or record the SEO exception in `NAMING.md`).

## Later / larger

- [ ] Imported formulas never recalculate — load live where they match Excel's value (L).
- [ ] Section detection and outline panel (M–L), then smart search on top of it (M–L).
- [ ] More intent-engine goals: conditions, count, average, lookup (M–L).
- [ ] AI formula args with named ranges and other sheets (S–M).

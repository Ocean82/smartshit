# Backlog

Open product and code work that is not on the living strategy
([`strategy/2026-09-24-usefulness-first-strategy.md`](strategy/2026-09-24-usefulness-first-strategy.md)).
Server/ops actions live in [`PRODUCTION-TODO.md`](PRODUCTION-TODO.md); checks that need live
infrastructure live in [`verification-backlog.md`](verification-backlog.md).

Swept 2026-10-06 from the planning, review, auditor, engine, and chat docs, checked against
`src/` and `server/src/`. Items marked **(verified)** were re-read in code during the sweep;
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

---

## 1. Correctness bugs (do first)

- [x] **AI formula results stop reaching cells after any workbook load** — done 2026-10-07 (`reset()` carries the callback over)
  - `SpreadsheetEngine.reset()` replaces `_aiRegistry` (`src/engine/spreadsheet.ts:87`);
    the update callback is set once on the original registry (`src/store/useStore.ts:36`).
    `loadWorkbook` calls `reset()` on boot, import, undo, and sheet ops, so `=AI.*` cells
    stay on "Loading…".
  - Fix: keep the callback on the engine and re-apply it in `reset()`; add a test.
- [ ] **Pivot tables drop the first data row** — S **(verified)**
  - `PivotDialog.tsx:66` adds 1 to `startRow` for the header and also passes `hasHeader`;
    `pivot.ts:18` adds 1 again. `pivot.test.ts:125` encodes the double skip.
- [ ] **Multi-step instant edits only undo the first step** — S **(verified)**
  - `historySlice.ts:103` finalizes the entry in a microtask, which runs at the first
    `await executeToolAsync` in `goalRouter.ts:79` and `agentParser.ts:192`.
- [ ] **Fill-down batches send `AI.PREDICT` / `AI.SCORE` to the LLM** — S
  - Single-cell route is deterministic (`server/src/routes/aiFunction.ts:229`); batches
    (`aiFunctionDefinitions.ts:467,486` → `server/src/batch.ts:253`) are not, and drop `values`.
- [ ] **Leftover `charCodeAt(0) - 65` column parsing** — S
  - `src/lib/formulaExplainer.ts:17,31`, `src/lib/previewBuilders.ts:53`,
    `src/hooks/useSpreadsheet.ts:68`; columns AA+ get the wrong header.
    `src/components/GridCanvas.tsx` looks unused — delete if confirmed.
- [ ] **Pivot grand totals always empty** — S
  - `src/engine/pivot.ts:84` returns `grandTotals: []`.
- [ ] **Closing the tab drops the pending IndexedDB save** — S
  - `main.tsx:96` teardown clears the save timer and only writes localStorage, which
    fails on quota for large workbooks.
- [ ] **Sheet load failures are invisible** — S
  - `loadWorkbook` (`spreadsheet.ts:78`) and `workbookSlice.ts:370` ignore `loadSheet`'s result.
- [ ] **Renaming a sheet doesn't update references** — M
  - `workbookSlice.ts:391` renames only; no formula rewrite, name validation, or undo entry.

## 2. Security and billing

- [ ] **AI batch endpoint ignores BYOK and overruns the free quota** — M
  - The client puts the BYOK key in each item's `args`; the server never uses it, and the
    key lands in the cache key (`server/src/batch.ts:57`). Usage is checked once, then up to
    100 calls are recorded (`routes/aiFunction.ts:466,479`). No `validateBody`; raw provider
    errors are returned.
- [ ] **`/api/ai-function` check-then-record race** — S
  - Checks at `aiFunction.ts:303`, records at `:388`; copy chat's atomic `reserveUsage`.
- [ ] **Sandbox `getRange` has no area cap** — S
  - `src/sandbox/api.ts:87`; a model-written full-sheet range freezes the tab.
- [ ] **Postgres cell sync isn't transactional** — S
  - `server/src/cellStore.ts:54` deletes then inserts in chunks on a shared pool; concurrent
    saves can interleave. S3 JSON remains the source of truth.

## 3. Auditor and inspector quality

- [ ] **One audit result that stays current** — M
  - `lastAuditResult` is set only at import (`importOrchestration.ts:113`), for one sheet,
    without custom rules. Panel runs and post-fix re-runs stay in local state, so the panel
    rail badge and import card go stale. Prerequisite for the tab badge and banner below.
- [ ] **Auditor reference extraction is naive** — S–M
  - `src/auditor/utils.ts:41` misses `$A$1`, range interiors, and other sheets, and matches
    `LOG10`. `isErrorValue` (`:17`) doesn't know `#CIRC!`, `#SPILL!`, `#CALC!`.
- [ ] **Auditor is quadratic on large sheets** — S
  - `getColumn`/`getRow` scan every cell per call (`auditor/index.ts:101`) and run on the
    main thread after import. Build row/column indexes once.
- [ ] **Inspector dependents are wrong** — M
  - `InspectorPanelContent.tsx:57` skips non-formula cells; `:101` matches `A1` inside
    `A10`; ranges are missed. `src/lib/formulaParse.tsx` says it is shared with the inspector
    but isn't imported.
- [ ] **Audit-entry import button needs the desktop toolbar** — S
  - The auditor's "Import a spreadsheet" button dispatches `smartsht:request-import`, which
    only `Toolbar` listens for. With the toolbar hidden it does nothing. Owning the file input
    in the panel or store fixes it. `/app?audit=1` also still needs a signed-in browser check.

## 4. Chat path (from the 2026-09-30 review)

- [x] **Templates overwrite cells without approval** — done 2026-10-06
  - On a sheet with data, `templateResolver.ts` returns an Apply action; empty sheets still build instantly.
- [x] **Timeouts and disconnects don't abort the model call (F13)** — done 2026-10-06
  - Stream route watches `res` close (Node fires `req` close once the body is read); first-byte
    timeout now aborts the upstream fetch. The client's 120s timeout therefore stops the provider too.
- [x] **Stop button in chat** — done 2026-10-07. Send turns into Stop while a reply runs;
  `stopAiResponse` / `clearChat` abort the turn's fetch, the server sees the disconnect and stops the provider.
- [ ] Non-streaming `withTimeout` (`providers.ts:116`) still rejects without aborting; `/api/chat` has no
  client caller, so low priority.
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
- [ ] Use `FREE_DAILY_LIMIT` in the AI upgrade copy instead of "7" (`featureGates.ts:43`) (S).

## Later / larger

- [ ] Imported formulas never recalculate — load live where they match Excel's value (L).
- [ ] Section detection and outline panel (M–L), then smart search on top of it (M–L).
- [ ] More intent-engine goals: conditions, count, average, lookup (M–L).
- [ ] AI formula args with named ranges and other sheets (S–M).

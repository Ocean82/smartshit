# Roadmap

**Status:** Living. This is the forward plan. It replaces `strategy/2026-09-24-usefulness-first-strategy.md`, whose P0, P1 and P2.1-2.2 are all complete.
**Written:** 2026-11-15, from a review of every plan, spec, review and investigation in `docs/`, `docs/superpowers/`, `.agents/`, `.kiro/specs/`, `.superpowers/` and the tool folders, checked against the code at HEAD.

Item-level detail lives in [`BACKLOG.md`](BACKLOG.md). Checks that need live infrastructure live in [`verification-backlog.md`](verification-backlog.md). Server actions live in [`PRODUCTION-TODO.md`](PRODUCTION-TODO.md). What changed and when lives in [`MAJOR_CHANGES.md`](MAJOR_CHANGES.md).

Sizes: **S** under half a day, **M** one to two days, **L** more.

---

## 1. Where the project stands

The product the roadmap set out to build, a spreadsheet that explains itself, is mostly there. Done and verified in code:

- **Strategy P0, P1, P2.1, P2.2:** formula engine parity, import honesty, act-path safety, the import activation card, the thumbs feedback loop, the full `format_cells` surface, layout tools, style recipes, the free audit entry, and honest privacy and BYOK copy.
- **Roadmap Phase 1:** import insights, the panel rail, the auditor as a first-class panel with a per-sheet health badge and a status-bar issue count, and the cell inspector with audit findings.
- **Chat review F1 to F16** (2026-09-30): re-verified resolved on 2026-10-11, including the failover re-budget, structured-output retry, BYOK parity and atomic usage reservation. Not re-run today.
- **Claims and trust:** xlsx export fidelity (#77), auditor fixes through preview (#78), corrected landing copy (#79), a server-side Pro gate for versions (#80), anonymous local-only mode (#81), and template install auth and dedup (#82, #84).
- **Subscription entitlement:** all twelve tasks are in code. `past_due` keeps Pro, and the revocation banner is mounted at the top level.
- **Chat styling safety (2026-11-15):** an unscoped "highlight X" no longer recolors the whole sheet.
- **Specs:** all five `.kiro` specs (`ai-model-rationalization`, `intent-engine-nlp`, `template-library-expansion`, `onnx-model-integration`, `cloud-sync-per-file-binding`) and every plan and spec in `docs/superpowers` (18 plans, 17 specs) have working code behind them. The only unticked boxes are optional property tests in the ONNX spec.

Quality gates at HEAD: 199 client test files (2,500 tests), 692 server tests, 32 real-engine tests, Playwright e2e, lint, typecheck. CI and deploy run on every push to `main`.

---

## 2. What has not been proven

These are the gaps between "the code exists" and "a customer gets the result".

1. **The P0 usefulness gate was never completed.** The strategy marks P0 complete, but the six-step gate was only partly run on 2026-09-28. Step 1 passed. Step 4 (five grounded Q&A turns) failed, was patched, and was never re-run. Steps 2, 3, 5 and 6 were never exercised. Record the result in `verification-backlog.md` section 11.
2. **Nothing that depends on a live model is verified.** That includes failover under rate limits and how a real model handles prompts the deterministic layers now defer, such as "highlight rent" or "highlight duplicates".
3. **Billing needs one human pass:** a Stripe cancel and resubscribe round trip, and a look at the deployed boot-reconcile log.
4. **The remaining live-infrastructure checks** in `verification-backlog.md` sections 1 to 10 (fresh-RDS migrations, S3 versions, ONNX paths, browser matrix, max-size imports).

---

## 3. Path forward

Ordered by what turns a first-time user away. Build only after the earlier stage is understood.

### Stage 0. Prove what shipped (S, mostly human)
- **0.1 Run the P0 gate** with a real budget `.xlsx` and at least five Q&A turns. Fix whatever fails before building anything new.
- **0.2 First-session prompt corpus (S).** About 60 prompts a new user actually types (highlight, find, select, clear, format, sum, "make it look professional") with the expected tool and scope, or an explicit "defer to the LLM". The highlight bug came from a gap no test covered, and this closes that class. It extends the existing false-positive corpus.
- **0.3 Billing round trip** (section 2, item 3).

### Stage 1. Navigation and selection (the missing core of the original roadmap)
The roadmap's Phase 2 and 3 promised "Find rent jumps to the cell" and "Explain this". Neither exists, and they are the gap you see when a customer asks the AI to find or point at something.
- **1.1 Find / go-to / select (M).** There is no tool to move the selection, scroll, or find a value. "Find groceries", "go to C5" and "select column B" only reach the LLM, which has no tool for them. Build one read-only tool plus a search bar. Because it never changes the sheet, it can run from any chat mode. Today only act-mode messages can reach tools.
- **1.2 Selection-aware chat, remainder (M).** Selected cell values are already sent in the prompt. Still missing: formulas, a size cap, and ranking the selection above whole-sheet data. This is what makes "highlight this", "explain this" and "is this right?" work.
- **1.3 "Explain cell" in the context menu (S).**
- **1.4 Persistent critical-findings banner with the score (S-M)**, then a **copyable or exportable audit report (M)**.
- **1.5 Section detection with an outline panel (M-L)**, then smart search over sections ("where are the expenses?").

### Stage 2. Answer quality and value proof (S-M each)
- Formula explainer coverage: SUMIFS, COUNTIFS, XLOOKUP, INDEX/MATCH, `$` references (M).
- Health-score history with before and after, for example 62 to 94 (M). This is the "value proof" from the original roadmap.
- Trend and month-over-month analysis (M). `contextualSuggestions.ts` already offers a "revenue trends" chip with nothing behind it, so build it or remove the chip.
- "What if I change this to $500?" downstream impact, read-only (M).
- `fill_missing` and `convert_types` cleaning with preview (M), and a pivot-based report (M).
- Formula-bar autocomplete (S-M), Pivot Table in the toolbar and context menu (S), mobile cell editing (S-M), dark mode (M).

### Stage 3. Platform (schedule, not quick wins)
- Server re-classifies every request instead of trusting the client's routing (M-L).
- Server integration tests plus an xlsx round-trip test (M).
- Split `SpreadsheetGrid.tsx`, now about 1,400 lines (M).
- Imported formulas never recalculate (L).
- More intent-engine goals (M-L) and AI function arguments with named ranges (S-M).

### Owner decisions and ops
- **`SENTRY_DSN`:** server and frontend error reporting are live in code and inert. Set it in the deploy `ENV` secret, not the server file. Deferred by the owner.
- **Credential rotation check** (BACKLOG #247). Manual.
- **Positioning:** `dev-first-positioning-claims` (2026-11-10) recommends "local-first, auditor-led, AI optional" over an anti-AI pivot. The claims it flagged were fixed in #77 to #81. Whether to change the headline copy is still undecided.

---

## 4. Deferred by decision (do not start)

| Item | Why it waits |
|------|--------------|
| MiniLM / ONNX surfaces: ship or remove (P2.3) | Changes what the product claims. MiniLM is real; the ONNX upload path is the question. |
| Community template marketplace | Conflicts with the "no marketplace in v1" non-goal. It is live today. |
| Styled xlsx export, status-bar aggregates, upward-expanding AutoSum, header-filter search, row auto-fit on wrap, Ctrl+Shift+M merge, split panes, formula-ref rewrite on cut-paste, cross-sheet cut and drag, Stripe Customer Portal | Each was deferred by its own plan. |
| Pro-only templates, weekly export cap | A monetization change. BYOK is free and unlimited today; confirm that is intended. |
| Dead code: `processMessage`, `callProviderStructured`, `defaultStepExecutor` | Deleting removes the tests that exercise them. Safe, but needs a yes. |

---

## 5. Changed or dropped

| Was planned | Now |
|-------------|-----|
| A Python "Spreadsheet Brain" spec (`planning/01-21`) | Archived. The brain layer was built in TypeScript from the roadmap instead. |
| A server-side `ToolExecutor` running QuickJS | Dropped. The QuickJS sandbox and the `execute_script` tool already run client-side with preview and one undo group (investigation 2026-10-19). |
| Native LLM tool calling | Not now. Two investigations (2026-10-18, 2026-10-19) rated it large, medium-high risk and against the project's stability rules. It stays in Stage 3 as a decision, not a task. |
| More deterministic computed-range templates | Only the weighted average shipped (#70). Filter-into-range, running total, per-group aggregate and conditional count stay LLM-only. |
| Local Ollama fallback | Removed 2026-11-13. The model could not answer inside the 90 s timeout on the production host. |
| "Orphaned formulas" auditor rule | Removed 2026-10-07. Its skips covered every case. |
| "Priority AI (faster models)" Pro claim | Removed from copy 2026-10-09. Nothing implemented it. |
| LRU eviction of local workbooks | Low value now that IndexedDB is the main store. Kept as a BACKLOG item only. |
| Apply posture | Decided 2026-10-12. User preference `applyPosture`, default `preview`. Only a low-risk allowlist auto-applies, and only in `auto`. |

---

## 6. Known small gaps (from `docs/superpowers/open-followups.md`)
- Floating images ignore row and column insert and delete. Chart ranges remap; images are pixel-positioned.
- Unquoted sheet names with spaces (`Sheet 1!A1`) are left alone instead of being parsed.
- Out of v1 on purpose: xlsx tab color and hidden state, sheet groups and protect, `HYPERLINK()`, sheet-scoped names, Paste Special dialog, Excel image export, 3D and external workbook references.

---

## 7. Where documents live now

| Kind | Location |
|------|----------|
| Forward plan | This file |
| Item catalog | `BACKLOG.md` |
| Live-infra checks | `verification-backlog.md` |
| Ops log (complete) | `PRODUCTION-TODO.md` |
| Change log | `MAJOR_CHANGES.md` |
| Product vision | `project_outline/outline.md` |
| Standards and reference | `spreadsheet-styling-standard.md`, `formualizer-gaps.md`, `PRICING_AND_MONETIZATION_PLAN.md`, `NAMING.md`, `LICENSING.md`, `ENV.md`, `DEPLOY.md` |
| History | `archive/` (see `ARCHIVE.md`) |
| Local agent history (gitignored) | `.agents/archive/`, `.superpowers/archive/`, `docs/superpowers/archive/`, each with a `MOVED.md` listing original paths |

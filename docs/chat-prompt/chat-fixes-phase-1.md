# Chat fixes — phase 1: mutation and approval safety

This is the first implementation batch following [the end-to-end review](chat-service-review-2026-09-30.md). It is not a claim that all 16 findings have been resolved.

## Implemented

- **F1, unintended edits:** shared conservative read-only classification for explanation, negation, hypothetical, and quoted-command requests. The production chat service bypasses every local mutation route for these requests and suppresses returned actions; the server shares that classification. The standalone regex parser also refuses them.
- **F2, wrong/stale target:** pending actions receive a locally assigned workbook ID, sheet ID, snapshot revision, selection identity, and session ID at request time. Apply rejects missing or stale scope instead of rebinding to the current tab. Additional selections are included.
- **F3, script undo:** a reviewed script's collected mutations commit synchronously with an explicit before/after history diff. Failed commits restore both the workbook and formula engine. A successful script produces one undo/redo entry; a failed commit produces none.
- **F4, forged approval data:** client conversion and server parsing strip model-authored preview/approval fields. Cleaning previews are recomputed locally. A script preview object alone never authorizes execution: only its in-memory, locally prepared mutation bundle does.
- **F5, preview drift/replay:** script preparation runs once against captured computed values. Apply commits those exact writes without executing code again. Scope and parameters must still match. Preparation/application states prevent repeated Apply, and rejection/clearing while preparation is pending cannot resurrect the action. Nested scripts/macros in an approved macro are refused rather than bypassing script preparation.
- **F8, unusable/misleading preview:** clear-sheet has a real cell/formula preview; formula-gap warnings are rendered before Apply. Script cards distinguish Review changes, Preparing preview, and Applying.
- **F10, dangerous keyword rule (partial):** the server's destructive shortcut now requires an explicit whole-request clear/reset/start-over command, rather than any occurrence of “blank.”
- **F14, erased refusal (partial):** the outer service preserves explicit server refusals instead of replacing them with a local fallback.
- **F15, concurrent send (partial):** normal concurrent sends are blocked in the store, not just by a disabled button; the Enter handler also checks processing and nonempty input.

## Deliberate conservative behavior

Snapshot revisions use immutable Zustand/Immer workbook identity, assigned in O(1) with a WeakMap. This avoids hashing or duplicating the full workbook for every proposal. The revision is session-local: pending actions from an older browser session must be regenerated.

Any workbook snapshot change, including an unrelated edit or a tab switch that updates workbook state, invalidates an outstanding proposal. Selection changes also invalidate it. Applying one proposal can therefore invalidate other proposals from the same response; atomic multi-action plan preparation is a later improvement. This deliberately favors refusing stale work over silently applying it to different data.

The existing immediate execution behavior for **explicit direct commands** (e.g. formatting, sorting, templates) is preserved. The welcome text now describes it accurately. Converting all mutation routes to a unified proposal/approval contract remains a separate product/architecture change. The new read-only detector is a conservative safety floor, not a complete natural-language authorization system.

The script's prepared mutation bundle is deliberately not persisted. Old or fabricated previews cannot authorize it after rehydration. As before, the sandbox uses snapshot-to-mutation collection semantics; full read-your-writes behavior and host API resource bounds remain to be implemented.

## Regression coverage

`src/store/__tests__/chatSafety.cases.ts` runs unchanged in both the default test tier and the real WASM formula-engine tier. It covers:

- Negation/explanation/hypothetical/quoted requests, including a backend that incorrectly proposes edits.
- Correct explicit commands.
- Sheet/workbook/selection changes and legacy unscoped actions.
- Model responses arriving after edits.
- Preserved auth refusal and store-level send serialization.
- Forged script previews, stale data/parameters, single script execution, duplicate Apply.
- Undo/redo, preparation rejection/clear, edits during preparation, partial-write rollback.
- Locally reconstructed cleaning previews and clear-sheet approval/undo.

`server/src/chatSafety.test.ts` covers shared read-only routing, the destructive shortcut, stripping approval metadata, and array-shaped parameters.

## Validation completed

- Frontend/shared: **1,881 tests passed** across 149 files.
- Server: **497 tests passed** across 32 files.
- Real WASM formula engine: **40 tests passed**, including all 28 shared safety regressions.
- `npm run lint:ci`: passed with zero warnings.
- Frontend production build (including TypeScript): passed.
- Server TypeScript build: passed.
- `git diff --check`: passed.

No paid model calls, production database writes, deployment, or remote GitHub operations were performed for this implementation batch.

## Still pending from the review

- Buffered SSE/NDJSON parsing on both sides of the connection.
- Attachment targeting, cross-sheet computed-value access, and faithful row-address context.
- Provider timeout/cancellation cleanup, clear-chat inference cancellation, and consistent result/error protocol.
- Final per-model token/byte budgeting and BYOK/streaming structured-output parity.
- Full per-tool schemas, unified action planning, script API semantics/resource bounds, and broader transaction support.
- Scope-aware conversation memory, authoritative usage accounting, and context-build performance improvements.

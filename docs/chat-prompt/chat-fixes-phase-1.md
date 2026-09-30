# Phase 1 application fixes — implementation notes

These notes accompany PR #45. They record what was broken in the **application**
(as opposed to the prompt contract, which Phase 0 covered), what changed, and how
each change is verified. Read `docs/chat-prompt/chat-contract-diff.md` for the
prompt-side delta; this document covers the code behind it.

## Guiding rule

> The model proposes. The application disposes.

Every fix below pushes one step of "turn model output into sheet mutations" back
under application control. The model is never allowed to decide *what happened*,
only *what it would like to happen*.

## F1 — Non-command requests must not mutate the workbook

**Before.** Any input that fell through the command parsers reached the LLM, and
the returned action list was executed with no guardrail distinguishing "the user
asked me to do something" from "the user asked me a question".

**After.** `shared/requestSafety.ts` classifies an incoming request before it
reaches any execution stage:

- `isDestructiveRequest` — asks to wipe, drop, clear, reset or delete.
- `isNonMutatingRequest` — greetings, thanks, questions, help, metadata about the
  assistant, and analysis requests phrased with interrogatives ("what is the
  total…") rather than imperatives.
- `isStructuralRiskRequest` — bulk structure changes (clear all sheets, reset the
  workbook, rename every column…).

`parseMessage` (`src/agent/parser.ts`) consults this and, for a request that is
neither mutating nor a request to generate content, returns
`{ kind: 'none', shouldUseLLM: false }`. A mutating-but-destructive request keeps
its normal route but is tagged so the confirmation prompt fires.

**Verify.** `shared/requestSafety.test.ts` (73 cases) and
`src/agent/__tests__/parserNonCommands.test.ts` (39 cases).

## F2 — Action scope binding and staleness

**Before.** An approved action was re-executed against whatever the workbook
looked like *at approval time*. If the user had switched sheets, edited the
referenced range, or the workbook had otherwise moved, the right patch landed in
the wrong place.

**After.** `src/lib/actionScope.ts` captures a scope tuple
`{ workbookId, sheetId, revision, selection }` when the action is prepared, and
`validateActionScope` re-checks it immediately before execution. Any drift
aborts with `stale`, a plain-language reason, and a chat message — nothing is
written.

The revision counter itself is now derived from a **single**
`useStore.subscribe` in `src/store/useStore.ts` (bump when the `workbook`
reference changes, with a re-entrancy guard). Previously three separate call
sites incremented it, which meant a scope check could pass against a stale
revision. The bump is a plain object `setState`, never an immer producer —
producing there would deep-freeze the workbook and break in-place mutation.

**Verify.** `src/lib/actionScope.test.ts` (13 cases) and
`src/store/__tests__/actionScopeApply.integration.test.ts` (9 cases, including a
tab-switch drift that must refuse).

## F3 — Script undo/redo and rollback

**Before.** `execute_script` wrote through the engine with no history entry and
no rollback. One bad script and the data was gone.

**After.** `src/store/aiExecution.ts` `applyPreparedScriptAction`:

1. snapshots the workbook before the write,
2. applies the patch,
3. on failure restores the snapshot and pushes a `failed` status plus a chat
   message.

The script path deliberately **skips** `pushHistory` — it owns its own
before/after entry — so the two histories cannot disagree.

**Verify.** `src/store/__tests__/scriptActionApplyPatch.integration.test.ts`
(undo/redo case).

## F4/F5 — Duplicate-Apply block and model metadata rejection

**Before.** Double-clicking Apply ran the script twice, and any
`previewChanges` / `scope` / `approval` fields the model invented were treated as
real.

**After.**

- `src/store/slices/chatSlice.ts` keeps an `inFlightActions` set. An action that
  is already running is ignored, and the completion callbacks only ever act if
  the stored status is still `previewing` — a Reject that lands mid-flight is
  never overwritten by the work it cancelled.
- `shared/actionParams.ts` is the trusted-boundary sanitizer:
  `sanitizeActionParams` drops model-supplied `previewChanges`, `scope`,
  `approval`, `prepared` and `signature`, and `isModelUntrustedParamKey` names
  the keys. It runs in **both** entry points that can accept model output —
  `server/src/parseResponse.ts` and the llm-gateway branch of
  `stageResultToChatMessage`.

**Verify.** `shared/actionParams.test.ts` (6 cases),
`server/src/parseResponse.test.ts` (3 cases), the double-Apply and
mid-flight-reject cases in
`src/store/__tests__/scriptActionApplyPatch.integration.test.ts`, and the
model-metadata-stripping case in `src/services/chatService.test.ts`.

## F5 — Prepared-patch application

**Before.** Apply re-ran the script. Whatever the script did on the second run
— nondeterminism, elapsed time, a sheet the user had since changed — became the
result.

**After.** The first Apply is *review only*: it runs a collect-only dry-run and
stores the exact `ScriptPatch` plus a `scriptPatchSignature` of it. The second
Apply commits **that patch verbatim** — no re-execution — after re-checking the
signature and the scope. A signature mismatch refuses.

**Verify.** `src/lib/scriptPatch.test.ts` (9 cases) plus the "commits the reviewed
patch verbatim, without re-running the script" and "refuses to commit a patch
whose signature no longer matches" cases.

## F8 — Clear-sheet previews and formula-gap warnings

**Before.** `clear_sheet` either produced no preview or produced one that ignored
what it was about to delete.

**After.** `src/lib/previewBuilders.ts` always returns a preview object for
`clear_sheet` covering values, formulas and format-only cells, and ignores any
model-supplied `previewChanges` (see F4). Formula gaps — a range that contains a
formula the preview cannot describe — are surfaced as an explicit warning rather
than silently omitted.

**Verify.** the four `clear_sheet` cases appended to
`src/lib/previewBuilders.test.ts`.

## F10 — "blank" no longer false-positives `clear_sheet`

**Before.** "leave B2 blank" matched the wipe rules and the model answered a
request about one cell by clearing the sheet.

**After.** `shared/actTemplates.ts` treats a single-cell "leave … blank" as a
`set_cell` to empty, and reserves `clear_sheet` for explicit whole-sheet/whole-
range wipes.

**Verify.** `shared/actTemplates.test.ts` (6 cases) — the `blank` regression is
pinned alongside the explicit-wipe rules that must keep resolving.

## F14 — Auth refusal is preserved over the local fallback

**Before.** When the agent server refused a request (bad/expired credentials,
plan limit), the client silently fell back to local execution and the user never
learned why the cloud path did not work.

**After.** `src/services/chatService.ts` keeps the server's refusal message and
status; the local fallback is only used for transient failures.

**Verify.** `src/services/chatService.test.ts` ("keeps the server auth refusal
over the local fallback").

## F15 — Concurrent-send guard

**Before.** Sending a second message while one was in flight produced two
interleaved action streams.

**After.** `chatService` guards on `isAiProcessing`; the second send is ignored
with a chat message instead of starting a parallel pipeline.

**Verify.** the non-command / no-mutation cases in
`src/services/chatService.test.ts` plus the store-level `isAiProcessing` guard
exercised through `processChatMessage`.

## Verification summary

| Suite | Result |
| --- | --- |
| `npx vitest run` | 157 files / 2029 tests passing |
| `npx vitest run --config vitest.integration.config.ts` | 1 file / 12 tests passing |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | 0 errors, 0 warnings |
| `npm test` (server) | 32 files / 489 tests passing |
| `npm run build` (server) | clean |

Baseline before this batch: 148 files / 1853 tests.

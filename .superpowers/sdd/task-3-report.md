# Task 3 Report: Magic-number auto-fix (multi-write)

## Status: DONE

## What I implemented

Modified `src/auditor/rules/hardcodedConstants.ts` (the hardcoded-constants audit rule) to make findings auto-fixable via a two-write `fixActions` sequence, per the plan brief (code used verbatim):

1. **Imports**: added `FixWrite` to the `../types` `import type`, and `refToCell` to the `../utils` import.
2. **Helper**: added `findFirstEmptyCellRight(ctx, row, col)` after the `ACCEPTABLE_CONSTANTS` declaration. It scans `c = col + 1` to `col + 50` and returns `refToCell(row, c)` for the first cell where `ctx.getCellAt(row, c)` is null (empty), else `null`.
3. **Finding block**: replaced the fixed `autoFixable: false` block with logic that:
   - computes a target input cell via the helper,
   - builds a boundary-anchored regex from the literal (`(?<![A-Za-z0-9_.])0\.335(?![A-Za-z0-9_.])`) so cell references/range refs aren't clobbered,
   - sets `fixActions` only when a target exists AND the literal actually matches in the formula — write 1 puts the constant's numeric value into the target cell (`{ cellId: target, value: Number(num) }`), write 2 rewrites the formula to reference the target (`{ cellId: cell.cellId, formula: '=B1*C2' }`),
   - keeps `autoFixable: !!fixActions` and adds `fixActions`.

Existing finding behavior (title, message, severity, cells, suggestion) is unchanged; the rule's non-fixable path (`target` null or literal unreplaceable) still produces a valid finding with `autoFixable: false` and no `fixActions`.

Appended one test to the existing `describe('auditor integration — full audit run', ...)` block in `src/auditor/__tests__/auditor.integration.test.ts` (fixture `=B1*0.335` in B2, first empty cell right = C2), asserting `fixActions` has length 2 with `fixActions[0]` = `{ cellId: 'C2', value: 0.335 }` and `fixActions[1]` = `{ cellId: 'B2', formula: '=B1*C2' }`.

## TDD Evidence

### RED (Step 2)
Command: `npx vitest run src/auditor/__tests__/auditor.integration.test.ts -t "hardcoded-constants findings are auto-fixable"`

Relevant failing output:
```
× auditor integration — full audit run > hardcoded-constants findings are auto-fixable with two writes 8ms
  → expected false to be true // Object.is equality
AssertionError: expected false to be true // Object.is equality
  ❯ src/auditor/__tests__/auditor.integration.test.ts:251:34
    251|     expect(finding!.autoFixable).toBe(true)
```

Why expected: before implementation the rule emitted `autoFixable: false` and no `fixActions`, so the new assertions on auto-fixability failed by design.

### GREEN (Step 4)
Command: `npx vitest run src/auditor/__tests__/auditor.integration.test.ts -t "hardcoded-constants findings are auto-fixable"`

Passing output: `✓ src/auditor/__tests__/auditor.integration.test.ts (10 tests | 9 skipped) — Test Files 1 passed (1), Tests 1 passed`.

## Verification results

- `npx vitest run src/auditor/__tests__/auditor.integration.test.ts src/auditor/customRules.test.ts` → **18/18 passed** (2 files)
- `npx vitest run` (full suite) → **407/407 passed** (40 files). One pre-existing stderr line from `src/engine/aiFunctions.test.ts` (`[AIFunction] Async error in AI.T: Error: boom`) — that test deliberately triggers an async error; unrelated to this change.
- `npx eslint src` → clean (no errors, no warnings)
- `npx tsc --noEmit` → clean

## Files changed

- `src/auditor/rules/hardcodedConstants.ts` (modified)
- `src/auditor/__tests__/auditor.integration.test.ts` (modified — one test added)

## Commit

- `117d0cc` feat(audit): magic-number auto-fix moves constants to input cells

## Self-review findings

- **Completeness**: all spec items done. Edge cases covered by the brief's design: no empty right cell → `fixActions` undefined / `autoFixable` false; literal not matchable in formula (regex `test` guard) → not fixable; literal appearing multiple times → only the first occurrence is replaced (regex is non-global, consistent with the rule's "first suspicious constant per cell" philosophy).
- **Quality**: helper name and local names are clear; code matches the plan verbatim; existing finding fields untouched.
- **Discipline**: only the two allowed files modified; nothing outside the task scope; no `.superpowers/sdd/*` files staged.
- **Testing**: TDD followed with RED evidence captured before implementation; focused test green; full auditor tests, full suite, eslint, and tsc all clean.

## Issues / concerns

- The boundary-anchored regex uses a lookbehind (`(?<!...)`). This requires a modern JS runtime (Node 16+/browsers); supported in the Vite/Vitest environment here (all tests pass). Worth noting for any legacy-target polyfill concerns.
- `findFirstEmptyCellRight` scans a fixed window of 50 columns to avoid unbounded scans — a deliberate, plan-specified cap.

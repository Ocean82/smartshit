# Task 2 Report — Custom rules engine + persistence + runAudit wiring

**Status:** DONE
**Commit:** `45c2d4c` — `feat(audit): custom form-based audit rules with localStorage persistence`

## What I implemented

1. **`src/auditor/customRules.ts`** (new) — the custom rules module, verbatim from the brief:
   - Types: `NumericRuleOperator`, `TextRuleOperator`, `EmptyRuleOperator`, `CustomRuleOperator`, `CustomAuditRule`.
   - `OPERATOR_LABELS: Record<CustomRuleOperator, string>`.
   - `loadCustomRules()` / `saveCustomRules()` — localStorage persistence under key `smartsht-audit-rules` (exact), both guarded with try/catch.
   - `ruleMatches(rule, cell)` — evaluates `contains`/`notContains` (case-insensitive), `isEmpty`/`isNotEmpty`, and the 6 numeric operators (non-numeric cells / non-finite thresholds return false).
   - `createCustomAuditRule(rule)` — wraps a custom rule as an `AuditRule` (`id: custom:<id>`, skips disabled rules and invalid column letters, emits findings with `autoFixable: false`).
2. **`src/auditor/index.ts`** (modified) — per the brief:
   - Imported `createCustomAuditRule, type CustomAuditRule` after the `./rules` import.
   - `runAudit(sheet, getComputedValue, customRules: CustomAuditRule[] = [])` — third param with a default, so all existing 2-arg callers are unaffected (verified: `useStore.ts:1266`, `brain.ts:248`, `AuditPanelContent.tsx:29`, integration + spreadsheet tests all pass 2 args).
   - Rule loop now runs `[...ALL_RULES, ...customRules.map(createCustomAuditRule)]`.
   - Added the two re-export lines after the existing re-exports.
3. **`src/auditor/customRules.test.ts`** (new) — the brief's test, with the two import paths corrected (see deviations) and the `rule()` helper's param made optional.

## TDD Evidence

### RED (before implementation)

Command: `npx vitest run src/auditor/customRules.test.ts`

After correcting the import path (see deviation #1), the run produced exactly the failure the brief predicted:

```
Error: Cannot find module '../customRules' imported from 'D:/spreadsheet/smartsht/src/auditor/customRules.test.ts'
❯ src/auditor/customRules.test.ts:7:1
...
Caused by: Error: Failed to load url ../customRules (resolved id: ../customRules) ... Does the file exist?
Test Files  1 failed (1)   |   Tests  no tests
```

Why the failure was expected: `customRules.ts` did not exist yet, so the module could not be resolved. (Initial run failed on `../index` instead — the brief's import-path issue, see deviations — so I corrected the import first to get the intended RED signal.)

### GREEN (after implementation)

Command: `npx vitest run src/auditor/customRules.test.ts src/auditor/__tests__/auditor.integration.test.ts`

```
✓ src/auditor/customRules.test.ts (8 tests) 7ms
✓ src/auditor/__tests__/auditor.integration.test.ts (9 tests) 7ms
Test Files  2 passed (2)
     Tests  17 passed (17)
```

Command: `npx eslint src` → no output (no errors, no warnings).
Command: `npx tsc --noEmit` → no output (clean).
Full suite before commit: `npx vitest run` → **406/406 passing across 40 files** (the only stderr line is from a pre-existing intentional-error test in `src/engine/aiFunctions.test.ts`, unrelated to this change).

## Files changed

- `src/auditor/customRules.ts` (new)
- `src/auditor/customRules.test.ts` (new)
- `src/auditor/index.ts` (modified: +9/−3)

## Self-review findings

- **Completeness:** All brief interfaces present (types, `OPERATOR_LABELS`, `loadCustomRules`/`saveCustomRules`, `ruleMatches`, `createCustomAuditRule`, `runAudit` third param, both export lines). `fixActions` untouched as required (custom rules are never auto-fixable). No new runtime dependencies. Storage key exactly `smartsht-audit-rules`.
- **Quality:** Source module is byte-for-byte the brief's code. `runAudit` gained a JSDoc `@param customRules` line to match the existing per-param doc style (behavior-neutral).
- **Discipline:** No overbuilding; no changes outside the three task files; existing style kept (2-space indent, single quotes, trailing commas, `import type`).
- **Testing:** Tests exercise real behavior end-to-end (rule evaluation through `runAudit` against a fixture sheet, plus a localStorage round-trip through the stub). The `vi.stubGlobal('localStorage', ...)` approach from the brief was preserved exactly; it worked — no real `localStorage` interference in the vitest environment.

## Deviations from the verbatim brief (all documented, all intent-preserving)

1. **Test import `'../index'` → `'./index'`** — the brief's test code was written as if the test lived in `src/auditor/__tests__/`, but the brief places it at `src/auditor/customRules.test.ts` (Files section, Step 5, and Step 6 all name that path). From `src/auditor/`, `'../index'` resolves to `src/index.ts`, which does not exist (only `App.tsx`/`main.tsx`/`env.d.ts`). The existing integration test uses `'../index'` correctly because it lives in `__tests__/`. Corrected to `'./index'`.
2. **Test imports `'../customRules'` → `'./customRules'` (both lines)** — same root cause, same fix.
3. **`function rule(overrides: Partial<CustomAuditRule>)` → `... = {}`** — the helper's param is required in the brief's code but called with zero arguments in 4 places. Vitest's esbuild doesn't typecheck, so the brief's tests passed anyway; `npx tsc --noEmit` surfaced `TS2554: Expected 1 arguments, but got 0` at 4 call sites. Made the param defaulted to `{}`, which matches the call sites' intent ("use defaults").
4. **JSDoc `@param customRules` line** in `runAudit` — small addition for doc consistency (see self-review).

## Issues / concerns

- None blocking. The three test-file deviations above are the only divergence from the brief's verbatim code; they are strictly necessary for the deliverable to typecheck and pass at the brief's specified file location. If the plan intends the test to live in `__tests__/` instead, that's a one-line location change and the original imports would be restored — flagging in case the controller prefers that layout.
- Pre-existing, unrelated working-tree modifications to `.superpowers/sdd/*` (progress.md, task briefs/reports) were left uncommitted, as in Task 1.

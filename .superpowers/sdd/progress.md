# Phase 4 Progress Ledger

| Task | Status | Commits | Review |
|------|--------|---------|--------|
| 1: Format Utilities | complete | b84b9a2 | Approved |
| 2: Number Format Rendering in Grid | complete | ac9edd2 | Approved |
| 3: Border Rendering in Grid | complete | fdeab6d | — |
| 4: History Integration for Format Changes | complete | fdeab6d | — |
| 5: Font Color Picker in Toolbar | complete | fdeab6d | — |
| 6: Format Panel Component | complete | fdeab6d | — |
| 7: Wire Format Panel into App | complete | fdeab6d | — |
| 8: Full Build and Test Verification | complete | fdeab6d | — |

# Audit Custom Rules & Auto-Fixes (plan 2026-07-31)

| Task | Status | Commits | Review |
|------|--------|---------|--------|
| 1: fixAction → fixActions array | complete | 2ca8873 | Approved (0 findings) |
| 2: custom rules engine + persistence + wiring | complete | 45c2d4c | Approved (minors → final review: untested notContains/isNotEmpty/lt/gte/lte/eq/neq + JSON-corrupt/storage-unavailable branches; `loadCustomRules` no shape validation; isEmpty message wording "B must be is empty" (plan-authored); index.ts extra JSDoc line beyond authorized corrections) |
| 3: magic-number auto-fix (multi-write) | complete | 117d0cc | Approved (minors → final review: lookbehind needs ES2018 (Node16+; toolchain fine); possible target-cell collision when 2 findings in same row share first empty right cell — mitigated by per-finding apply + 200ms re-audit but confirm in final review; pre-existing tokenizer splits multi-digit literals — new guard safely declines to fix) |
| 4: custom rules manager UI | complete | 835a546 | Approved (minors → final review: auto-audit re-runs after every active-sheet edit — plan-inherent, drops old !result guard; NaN threshold can be saved via type=number (never matches); Plus icon onClick inside button not keyboard-accessible; stale column on edit. Deviations: effect deps +activeSheet, one eslint-disable on ruleVersion useCallback — both necessary for react-hooks v7 0-warning gate, behavior-identical) |
| 5: whole-branch review | complete | — | Final review `8f26044..835a546`: 3 Important (unstale-audit deps, single-write fix non-atomicity, asymmetric text operators) + 7 minor; no Critical → **Ready with fixes** |
| 6: final fix wave | complete | 24e64e4, b2ada6e | All 8 fixes applied. `24e64e4` = Fix 1 (stable deps via getState, deps `[getComputedValue, ruleVersion]`), Fix 2 (batch pre-flight: abort whole batch if any value-write target occupied, before pushHistory), Fix 3 (initial), Fix 4–7 (NaN guard, Plus a11y, stale column, wording), Fix 8 (operator tests). `b2ada6e` = follow-up: `notContains` now uses the identical String(rawValue) haystack as `contains` (design L49, symmetric complement) after first-pass fixer kept a non-string guard that reintroduced asymmetry. Verified: eslint 0/0, tsc clean, vitest 412/412. `src/types/api.ts` untouched. |

| 7: post-review fix wave 2 (user-approved) | complete | f30d31b, 22e85d1 | 4 fixes from my critical audit, user approved #1–#4: (1) custom rules evaluate COMPUTED value of formula cells — helpers `cellNumber`/`cellText`/`cellIsEmpty`, plain-cell behavior byte-identical; (2) re-audit on sheet switch — `activeSheetId` added to auto-run effect deps (string, stable across edits, NOT `activeSheet`); (3) `getFixAbortReason` extracted to `index.ts` + visible dismissible `role="alert"` notice (was silent batch abort); (4) `loadCustomRules` shape validation (`isValidCustomRule` drops junk rules that could NaN the score). Reviewer: Approved, 0 Critical/Important, 3 Minor → applied in `22e85d1` (clear fixMessage on re-audit, boolean clarity, comment). Verified: eslint 0/0, tsc clean, vitest 424/424. Fix 2 has no unit test (no component test infra — user accepted deps-change + gates). `src/types/api.ts` untouched. |

**Status: COMPLETE.** All 6 tasks + 2 fix waves done, verified green (eslint 0/0, tsc clean, vitest 424/424), commits on `main`. Out-of-scope notes: pre-existing `makeSheet` fixture uses 0-based IDs vs engine's 1-based `refToCell` (B0→column A); pre-existing tokenizer splits multi-digit literals (hardcodedConstants declines to fix). Outstanding Minor from audit (user declined scope, recorded here): (5) formula-write fixes don't dirty-check the target own cell; (6) `getComputedValue` bound to active sheet, not audited sheet — latent coupling, works today; (7) rules global while column dropdown is per-sheet; (8) magic-number scan bounded col+50; (9) no STORAGE_KEY schema version.

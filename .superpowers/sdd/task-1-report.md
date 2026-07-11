## Task 1: Format Utilities — Report

**Status:** DONE

### What was done

Created `src/lib/formatUtils.ts` with:
- `NUMBER_FORMATS` — readonly array of 6 format options (General, Number, Currency, Percent, Date, Text)
- `formatCellValue()` — renders cell values with locale-aware formatting for each number format type
- `getBorderCSS()` — converts border config to React CSSProperties

### Tests

All 14 existing tests pass (6 test files). No formatUtils-specific tests exist in the repo — the 14 tests are pre-existing AI/intent tests that must not regress.

### Commit

- `b84b9a2` — `feat: add format utilities for number rendering and border CSS`

### Self-Review

- File content matches the task brief exactly
- Imports use `@/types` path alias (configured in tsconfig.json)
- `formatCellValue` handles null, undefined, boolean, string, and number inputs
- `getBorderCSS` returns empty object for undefined borders, mapping each side correctly
- No regressions: all 14 tests still pass

### Concerns

None.

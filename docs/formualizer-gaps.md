# Formualizer Gaps & Issues for SmartSht

> Compiled from: GitHub issues, source analysis, SmartSht integration behavior, and formualizer.dev docs.
> SmartSht uses `@ocean8219/formualizer@0.7.2` — latest is `0.8.4`.

---

## 1. Version Gap (0.7.2 → 0.8.4)

SmartSht is 3 minor versions behind. The following was fixed/added in 0.7.3–0.8.4 that SmartSht is missing:

- Multiple structural edit undo bugs fixed
- Dependency graph edge-drop fixes (silent stale values)
- Database function empty-text handling fix
- SheetPort GIL deadlock fix (Python, but Rust core changes)
- FormulaPlane span evaluation improvements
- Semantic reference consolidation hardening

**Recommendation:** Upgrade to `@ocean8219/formualizer@^0.8.4`

---

## 2. Known Open Bugs (Affecting SmartSht Import/Eval)

These are open issues on GitHub that directly impact SmartSht's uploaded worksheet behavior:

### Critical for Imported Workbooks

| Issue | Impact on SmartSht |
|-------|-------------------|
| [#312](https://github.com/psu3d0/formualizer/issues/312) — binary +/- preserve a Date type that Excel doesn't have | Date arithmetic produces wrong types; formulas like `=A1+30` on date cells may not return expected serial numbers |
| [#291](https://github.com/psu3d0/formualizer/issues/291) — date text in ordering comparisons and COUNTIF/SUMIF diverges from Excel | COUNTIF/SUMIF with date criteria produce wrong counts |
| [#290](https://github.com/psu3d0/formualizer/issues/290) — additional date/time text forms rejected that Excel accepts | Single-digit year, 24:00, fractional seconds, month-year formats fail to parse |
| [#319](https://github.com/psu3d0/formualizer/issues/319) — MATCH exact-match coerces blank cell to 0 | MATCH(0, range, 0) falsely matches empty rows |
| [#285](https://github.com/psu3d0/formualizer/issues/285) — COUNTBLANK/COUNTIF over never-written blank ranges | Counting blanks in sparse ranges gives wrong results |
| [#283](https://github.com/psu3d0/formualizer/issues/283) — VLOOKUP/HLOOKUP approximate mode has no sortedness guard | Approximate VLOOKUP on unsorted data returns garbage instead of #N/A |
| [#295](https://github.com/psu3d0/formualizer/issues/295) — wildcard matchers ignore ~ escapes, leak SQL LIKE metacharacters | COUNTIF/SUMIF with wildcard criteria (*, ?) produce wrong results |

### Structural Edit Bugs (Affect Row/Column Insert During Use)

| Issue | Impact |
|-------|--------|
| [#313](https://github.com/psu3d0/formualizer/issues/313) — row/column insert doesn't invalidate position-sensitive open-range readers | After inserting rows, MATCH/INDEX formulas serve stale values |
| [#314](https://github.com/psu3d0/formualizer/issues/314) — structural-delete invalidation ignores cross-axis interval | Up to 12.8x unnecessary recalculation on deletion |
| [#304](https://github.com/psu3d0/formualizer/issues/304) — default-sheet insert publishes name/table vertices into cell index | Named ranges silently destroyed, stale values served |
| [#303](https://github.com/psu3d0/formualizer/issues/303) — undo of logged row insert leaves data unrestored | Wrong values after undo |
| [#302](https://github.com/psu3d0/formualizer/issues/302) — structural edit on unrelated sheet drops formula→name edges | Silent stale values across sheets |
| [#301](https://github.com/psu3d0/formualizer/issues/301) — undo of value write to referenced empty cell drops dependent formula edge | Silent stale values after undo |

### Other Eval Issues

| Issue | Impact |
|-------|--------|
| [#333](https://github.com/psu3d0/formualizer/issues/333) — CELL("contents") on blank cell and CELL("address") off-sheet | CELL() function returns wrong values |
| [#265](https://github.com/psu3d0/formualizer/issues/265) — reference-returning selections inherit false compressed-range self-cycles | Circular reference false positives |
| [#288](https://github.com/psu3d0/formualizer/issues/288) — legacy .xls (BIFF) ingest lacks formula fidelity | 33% formula load failure rate on .xls files |

---

## 3. Features/Functions NOT Supported

Based on the documented categories and what's commonly used in Excel but NOT listed:

### Missing/Incomplete Function Categories

| Category | What's Missing | Common Usage |
|----------|---------------|-------------|
| **Array/Dynamic** | `SEQUENCE`, `RANDARRAY`, `LET` (available in LET/LAMBDA category but may have edge cases) | Modern Excel 365 formulas |
| **Cube Functions** | `CUBEVALUE`, `CUBEMEMBER`, `CUBESET`, etc. | Power Pivot/OLAP workbooks |
| **Web Functions** | `WEBSERVICE`, `ENCODEURL`, `FILTERXML` | Web-connected spreadsheets |
| **External References** | `[Book2.xlsx]Sheet1!A1` cross-workbook references | Multi-file linked workbooks |
| **User-Defined Functions (VBA)** | Any VBA/macro-based custom functions | Macro-enabled workbooks (.xlsm) |
| **Power Query** | `_xlfn.` prefixed functions from newer Excel | Excel 365-specific calculations |

### Known Behavioral Gaps vs. Excel

| Feature | Formualizer Behavior | Excel Behavior |
|---------|---------------------|----------------|
| **Implicit intersection** (`@` operator) | Likely not fully supported | Excel 365 uses `@` for implicit intersection in dynamic arrays |
| **Structured references** | Supported via `addTable()` but may have edge cases | `Table1[Column]` syntax in formulas |
| **Named ranges** | Supported but has edge-drop bugs (#302, #304) | Critical for complex workbooks |
| **R1C1-style references** | Unknown support level | Some exported formulas use R1C1 |
| **Array formulas (CSE)** | `{=FORMULA}` legacy array entry | Ctrl+Shift+Enter formulas in older Excel |
| **Error propagation** | Generally correct but COUNTIF/SUMIF edge cases | Strict Excel error semantics |
| **Locale-aware parsing** | Limited — uses `FormulaDialect.Excel` | Semicolons as arg separators in EU locales |
| **1904 date system** | Unknown | Mac Excel uses 1904 date system |

---

## 4. Date/Time Specific Issues

Dates are the most problematic area for SmartSht imports:

1. **Serial number interpretation** — Formualizer handles Excel serial dates (1900 system) but:
   - Issue #312: Date arithmetic (+/-) preserves a Date type Excel doesn't have
   - Issue #290: Many text-to-date conversions fail that Excel accepts
   - Issue #291: Date text comparisons in COUNTIF/SUMIF diverge

2. **Missing date text formats** that Excel parses but Formualizer rejects:
   - Single-digit year: `1/2/5` (January 2, 2005)
   - 24:00 as midnight
   - Fractional seconds: `12:30:45.5`
   - Month-year only: `Jan 2024`
   - DATEVALUE/TIMEVALUE with non-standard inputs

3. **Time functions with dates** — When a cell contains a datetime serial like `45488.75`, functions like HOUR/MINUTE/SECOND should extract the fractional part, but the Date type preservation bug (#312) may cause incorrect extraction.

---

## 5. Lookup Function Issues

| Function | Issue |
|----------|-------|
| VLOOKUP (approx mode) | No sortedness validation (#283) — returns garbage on unsorted ranges instead of #N/A |
| MATCH (exact mode) | Blank→0 coercion (#319) — matches empty cells when searching for 0 |
| XLOOKUP | Should work (listed in docs) but verify edge cases with wildcards |
| INDEX/MATCH combo | Works for basic cases; may fail after row inserts (#313) |
| INDIRECT | May not resolve cross-sheet references correctly given named-range bugs |

---

## 6. Conditional/Criteria Function Issues

All functions using criteria matching (wildcards, comparisons) are affected by #295:

- `COUNTIF` / `COUNTIFS`
- `SUMIF` / `SUMIFS`  
- `AVERAGEIF` / `AVERAGEIFS`
- `DCOUNT` / `DSUM` / `DAVERAGE` etc.

**Specific problems:**
- `~` escape for literal `*` and `?` is ignored
- SQL LIKE metacharacters may leak through
- Exponential regex behavior on certain patterns (potential DoS)
- Date text in criteria diverges from Excel (#291)

---

## 7. What to Fix in Formualizer (Priority Order)

### P0 — Blocking SmartSht core functionality

1. **Date arithmetic type preservation** (#312) — Causes formula results to be Date objects instead of numbers
2. **VLOOKUP/HLOOKUP approximate mode sortedness** (#283) — Returns garbage data  
3. **Date text parsing gaps** (#290) — Common date formats rejected
4. **Wildcard/criteria matching** (#295) — COUNTIF/SUMIF wrong results and perf issues

### P1 — Causes incorrect data after user edits

5. **MATCH blank→0 coercion** (#319)
6. **COUNTBLANK on sparse ranges** (#285)
7. **Date text in COUNTIF/SUMIF criteria** (#291)
8. **Row insert invalidation for MATCH/INDEX** (#313)

### P2 — Structural integrity

9. **Named range edge drops on structural edits** (#302, #304)
10. **Undo bugs** (#301, #303)
11. **Cross-axis invalidation waste** (#314)

### P3 — Import fidelity

12. **.xls BIFF formula load failures** (#288) — 33% failure rate
13. **CELL() function divergence** (#333)

---

## 8. SmartSht-Specific Workaround Applied

In the meantime (until Formualizer fixes land), SmartSht now:

- **Stores Excel's pre-computed values** during import instead of re-evaluating formulas through Formualizer
- **Uses store values as display source of truth** for non-formula cells
- **Falls back to stored values** when Formualizer evaluation produces empty/error results for formula cells
- **Only sends formulas to Formualizer for evaluation** when the user explicitly edits a formula cell

This means imported worksheets display correctly, but editing an imported formula cell will use Formualizer's evaluation — which may produce different results for the affected functions above.

---

## 9. Upgrade Path

```bash
npm install @ocean8219/formualizer@^0.8.4
```

After upgrading, re-test:
- Date arithmetic formulas
- VLOOKUP with approximate matching
- COUNTIF/SUMIF with wildcard criteria
- Named range references across sheets
- Row/column insert operations with dependent formulas

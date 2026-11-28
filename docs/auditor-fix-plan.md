# Auditor fix plan

**Status: implemented.** Deviations: item 7's IFERROR fix needed no change (audit fixes are always staged as a previewed `execute_script` action, which is not on the auto-apply allowlist); item 12 is already caught by `inconsistent-formulas` along rows, so it got a regression test instead of a new rule; item 14 uses `src/auditor/score.ts` (non-critical weight divided by formulas/100 above 100 formulas, critical always full).

Source: investigation of `src/auditor/`. Item 1 was reproduced with a test. The other behaviours were read from the code and still need a failing test before the fix.

Conventions: Vitest only, no new dependencies. Each rule gets a dedicated `src/auditor/rules/<rule>.test.ts`. Write the failing test first, then fix. Run `npx vitest run src/auditor` after each phase.

## Confirmed bug

Input `=A1*$B$17` produces "Magic number 17 in C1". The auto-fix writes `17` into D1 and rewrites the formula to `=A1*$B$D1`, which corrupts the reference. Cause: the strip regex in `hardcodedConstants.ts` does not match refs with `$`.

## Phase 1: correctness (ship first)

1. **hardcodedConstants: absolute refs.**
   - File: `rules/hardcodedConstants.ts`. Reuse the ref-aware tokenising already in `utils.ts` (`normalizeFormula` regex, `extractRangeRefs`) rather than a new regex.
   - Strip `\$?[A-Z]{1,3}\$?\d{1,5}` (and ranges with `$`) before extracting numbers. Skip sheet-qualified refs too.
   - Make the fix pattern match whole numeric tokens only, ignoring digits inside refs. Add a guard: after rewriting, the new formula must still differ from the old one only at the literal.
   - Tests: `=A1*$B$17`, `=SUM($C$2:$C$40)*1.3`, `Sheet2!$B$17`, `=A1*17` (still flagged, fix correct).
2. **inconsistentFormulas: double reporting.** Report each cell once. If a cell deviates in both its row and its column, keep the finding from the group where it deviates from the larger dominant count. Add a test that checks one finding per cell and a stable score.
3. **inconsistentFormulas: table blocks.** Split a column or row into contiguous blocks (break on 2 or more blank cells) before comparing. Test: two stacked tables with different formulas in the same column produce no findings.

## Phase 2: missing detection in existing rules

4. **New rule `hardcodedInFormulaColumn`** (high). In a block where at least 70% of cells are formulas of one pattern, flag a number that sits where the pattern expects a formula. Do not flag summary or header cells (`isSummaryCell`). No auto-fix. Register in `rules/index.ts`.
5. **rangeGaps.**
   - Treat neighbouring formula cells as data (`type === 'number' || 'formula'`), excluding the formula cell itself and cells that depend on it.
   - Look past a single blank row or column (gap of 1).
   - Handle 2D ranges by checking each edge.
   - Keep the fix to extending the range. Mark it `autoFixable: false` when the neighbour is a formula, since that may be a subtotal.
6. **hardcodedConstants allowlist.** Remove tax and markup rates (`0.05` to `0.09`, `0.15` to `0.33`, `1.05` to `1.25`) from the allowlist so they are flagged. Keep structural values such as 0 to 12, 24, 52, 60, 100, 365, 1000. Report every suspicious constant in the cell in the message, not only the first (fix still handles the first).
7. **errorCells.** Add descriptions and suggestions for `#CIRC`, `#SPILL` and `#CALC`. Mark the `IFERROR(..., 0)` fix as requiring preview. No behaviour change in auto mode: check how `auditFixAction.ts` decides risk and make sure this fix counts as not low-risk.

## Phase 3: new checks (each a small rule, medium or low severity, no auto-fix)

8. Numbers stored as text in a mostly numeric column.
9. Approximate-match lookup (`VLOOKUP`/`HLOOKUP` with no 4th argument or `TRUE`, `MATCH` with type 1 or omitted).
10. Orphaned inputs: a numeric constant cell referenced by nothing, outside a table-like block. Info only, to limit noise.
11. Percent versus decimal mix in a column (values 0 to 1 beside values above 1 with a `%` format or header).
12. Totals that do not reconcile: a SUM/total cell whose range excludes a row that the neighbouring columns' totals include. Start with the same-row comparison only.

## Phase 4: cross-sheet and scoring

13. **Cross-sheet awareness.** Extend `AuditContext` with an optional `workbook` (sheet names plus a cell lookup). Use it to:
    - flag references to a sheet that does not exist (critical, matches `#REF!` risk);
    - detect cycles that cross sheets in `circularRefs`.
    Keep the single-sheet path working when `workbook` is absent. `runAudit` callers need the new argument threaded through (find them with grep first).
14. **Scoring.** Make the per-rule cap scale with formula count (for example, penalty per rule capped at 40 but findings weighted per 100 formulas above a size threshold), and show the finding count next to the score. Update `report.ts` and `auditResult.test.ts` expectations. Decide the exact formula with the user before building; this changes every sheet's score.

## Phase 5: tests and docs

15. Add dedicated test files for `errorCells`, `rangeGaps`, `inconsistentFormulas`, `circularRefs`, `magnitudeOutliers`, `volatileFunctions`, `duplicateFormulas`, `hiddenDependencies`.
16. Update `landing/formula-auditor.md` (and the `.html` it generates from, if generated) for any new rule or changed behaviour. Archive or annotate `docs/archive/auditor/auditor-plans.md` as superseded.

## Order and risk

- Phase 1 is a bug fix and can ship alone.
- Phases 2 and 3 add or change findings, so they change scores for existing users. Tell the user before release.
- Phase 4 changes a shared type and the scoring contract. Do it last, after a decision on item 14.
- Open decisions: item 14's formula, whether item 10 is worth the noise, and whether to ship Phase 3 rules on by default or behind a setting (`preferences.ts` already supports toggles).

## Verification

`npx vitest run src/auditor src/store`, then `npx tsc --noEmit` and `npx eslint src/auditor`.

### Task 3: Magic-number auto-fix (multi-write)

**Files:**
- Modify: `src/auditor/rules/hardcodedConstants.ts`
- Test: `src/auditor/__tests__/auditor.integration.test.ts` (add one test)

**Interfaces:**
- Consumes: `FixWrite[]` via `AuditFinding.fixActions` (Task 1); `ctx.getCellAt(row, col)` from `AuditContext`; `refToCell` from `./utils`.
- Produces: hardcoded-constants findings with `autoFixable: true` and a two-write `fixActions` (input-cell value write + rewritten formula write), when a safe target cell exists and the literal is replaceable.

- [ ] **Step 1: Write the failing test**

Append to `src/auditor/__tests__/auditor.integration.test.ts` (same describe block):

```ts
  it('hardcoded-constants findings are auto-fixable with two writes', () => {
    const cells: SheetData['cells'] = {
      'A0': { value: 'Label' },
      'B0': { value: 'Value' },
      'A1': { value: 'x' },
      'B1': { value: 100 },
      'A2': { value: 'Total' },
      'B2': { value: null, formula: '=B1*0.335' },
    }
    const sheet: SheetData = {
      id: 'mc',
      name: 'Magic',
      cells,
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }
    const getValue = (row: number, col: number) => {
      const id = refToCell(row, col)
      const c = cells[id]
      return c?.value == null ? '' : String(c.value)
    }

    const result = runAudit(sheet, getValue)
    const finding = result.findings.find((f) => f.ruleId === 'hardcoded-constants' && f.cells[0]?.cellId === 'B2')

    expect(finding).toBeDefined()
    expect(finding!.autoFixable).toBe(true)
    expect(finding!.fixActions).toHaveLength(2)
    // write 1: constant moved into the first empty cell right of B2 → C2
    expect(finding!.fixActions![0]).toEqual({ cellId: 'C2', value: 0.335 })
    // write 2: formula rewritten to reference the input cell
    expect(finding!.fixActions![1]).toEqual({ cellId: 'B2', formula: '=B1*C2' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auditor/__tests__/auditor.integration.test.ts -t "hardcoded-constants findings are auto-fixable"`
Expected: FAIL — the finding has `autoFixable: false` (or no `fixActions`).

- [ ] **Step 3: Implement the fix in hardcodedConstants.ts**

In `src/auditor/rules/hardcodedConstants.ts`:

Change the import from `../types`:

```ts
import type { AuditRule, AuditFinding, AuditContext, FixWrite } from '../types'
```

Change the import from `../utils`:

```ts
import { findingId, refToCell } from '../utils'
```

Add a helper after the `ACCEPTABLE_CONSTANTS` declaration:

```ts
/** First empty cell in the row, scanning right from the formula's column. */
function findFirstEmptyCellRight(ctx: AuditContext, row: number, col: number): string | null {
  for (let c = col + 1; c <= col + 50; c++) {
    if (!ctx.getCellAt(row, c)) return refToCell(row, c)
  }
  return null
}
```

Replace the finding-push block inside the `run` method (the block starting at `const num = suspicious[0]` and ending at the closing `})` of `findings.push({...})`):

```ts
      const num = suspicious[0]
      const target = findFirstEmptyCellRight(ctx, cell.row, cell.col)
      const escaped = num.replace(/\./g, '\\.')
      const replacePattern = new RegExp(`(?<![A-Za-z0-9_.])${escaped}(?![A-Za-z0-9_.])`)
      const fixActions: FixWrite[] | undefined =
        target && replacePattern.test(cell.formula)
          ? [
              { cellId: target, value: Number(num) },
              { cellId: cell.cellId, formula: `=${cell.formula.replace(replacePattern, target)}` },
            ]
          : undefined

      findings.push({
        id: findingId(),
        ruleId: 'hardcoded-constants',
        severity: 'medium',
        title: `Magic number ${num} in ${cell.cellId}`,
        message: `Cell ${cell.cellId} has hardcoded value ${num} in formula =${cell.formula}. Hardcoded values are fragile — if the number changes, you have to find every formula that uses it.`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: `Move ${num} to a dedicated input cell and reference that cell instead`,
        autoFixable: !!fixActions,
        fixActions,
      })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/auditor/__tests__/auditor.integration.test.ts src/auditor/customRules.test.ts`
Expected: PASS (all).

Run: `npx eslint src`
Expected: no errors, no warnings.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/auditor/rules/hardcodedConstants.ts src/auditor/__tests__/auditor.integration.test.ts
git commit -m "feat(audit): magic-number auto-fix moves constants to input cells"
```

---


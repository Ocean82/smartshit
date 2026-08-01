### Task 1: Fix model — `fixAction` → `fixActions` array

**Files:**
- Modify: `src/auditor/types.ts:28` (replace `fixAction?` field, add `FixWrite`)
- Modify: `src/auditor/rules/rangeGaps.ts:54,79,110,134` (four `fixAction` blocks → `fixActions` arrays)
- Modify: `src/auditor/rules/errorCells.ts:58-62,73` (`fixAction` → `fixActions`)
- Modify: `src/components/panels/AuditPanelContent.tsx:50-62` (`handleFix` iterates array)
- Test: `src/auditor/__tests__/auditor.integration.test.ts` (add one test)

**Interfaces:**
- Produces: `FixWrite` type = `{ cellId: string; formula?: string; value?: string | number | null }`; `AuditFinding.fixActions?: FixWrite[]`. `AuditFindingCard` props unchanged. `handleFix(finding)` consumes `finding.fixActions`.

- [ ] **Step 1: Write the failing test**

Append to `src/auditor/__tests__/auditor.integration.test.ts` (inside the existing `describe('auditor integration — full audit run', ...)`):

```ts
  it('marks #DIV/0! errors as auto-fixable with an IFERROR wrap', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    const div0 = result.findings.find((f) => f.ruleId === 'error-cells' && f.cells[0]?.cellId === 'B7')
    expect(div0).toBeDefined()
    expect(div0!.autoFixable).toBe(true)
    expect(div0!.fixActions).toHaveLength(1)
    expect(div0!.fixActions![0].formula).toBe('=IFERROR(1/0, 0)')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auditor/__tests__/auditor.integration.test.ts`
Expected: FAIL — `fixActions` does not exist on type `AuditFinding`.

- [ ] **Step 3: Update the finding type**

In `src/auditor/types.ts`, replace:

```ts
export interface AuditFinding {
  id: string
  ruleId: string
  severity: Severity
  title: string
  message: string
  cells: CellLocation[]
  suggestion?: string
  /** Whether this finding can be auto-fixed */
  autoFixable: boolean
  /** Fix descriptor: formula to set on the target cell */
  fixAction?: { cellId: string; formula?: string; value?: string | number | null }
}
```

with:

```ts
export interface FixWrite {
  cellId: string
  formula?: string
  value?: string | number | null
}

export interface AuditFinding {
  id: string
  ruleId: string
  severity: Severity
  title: string
  message: string
  cells: CellLocation[]
  suggestion?: string
  /** Whether this finding can be auto-fixed */
  autoFixable: boolean
  /** Fix writes: set formula/value on each target cell, in order */
  fixActions?: FixWrite[]
}
```

- [ ] **Step 4: Convert the emitting rules**

In `src/auditor/rules/errorCells.ts`, replace:

```ts
      // Auto-fixable: #DIV/0! can be wrapped in IFERROR
      const autoFixable = errorType === '#DIV/0!' && !!cell.formula
      const fixAction = autoFixable && cell.formula
        ? { cellId: cell.cellId, formula: `=IFERROR(${cell.formula}, 0)` }
        : undefined
```

with:

```ts
      // Auto-fixable: #DIV/0! can be wrapped in IFERROR
      const autoFixable = errorType === '#DIV/0!' && !!cell.formula
      const fixActions = autoFixable && cell.formula
        ? [{ cellId: cell.cellId, formula: `=IFERROR(${cell.formula}, 0)` }]
        : undefined
```

and in the same file replace the `fixAction,` property in the pushed finding object with `fixActions,`.

In `src/auditor/rules/rangeGaps.ts`, convert all four `fixAction: { ... },` blocks to `fixActions: [{ ... }],` by replacing `fixAction: {` with `fixActions: [{` and the matching closing `},` with `}],`. The four blocks are exactly:

```ts
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula!.replace(range, `${extendedStart}:${end}`)}`,
                },
```

```ts
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula!.replace(range, `${start}:${extendedEnd}`)}`,
                },
```

```ts
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula.replace(range, `${extendedStart}:${end}`)}`,
                },
```

```ts
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula.replace(range, `${start}:${extendedEnd}`)}`,
                },
```

- [ ] **Step 5: Update the apply path**

In `src/components/panels/AuditPanelContent.tsx`, replace the whole `handleFix` callback (lines 50-62):

```ts
  const handleFix = useCallback((finding: AuditFinding) => {
    if (!finding.fixAction) return
    const store = useStore.getState()
    const { cellId, formula, value } = finding.fixAction
    store.pushHistory('Audit auto-fix')
    if (formula) {
      const formulaStr = formula.startsWith('=') ? formula : `=${formula}`
      store.setCellValue(cellId, null, formulaStr)
    } else if (value !== undefined) {
      store.setCellValue(cellId, value)
    }
    setTimeout(() => handleRunAudit(), 200)
  }, [handleRunAudit])
```

with:

```ts
  const handleFix = useCallback((finding: AuditFinding) => {
    if (!finding.fixActions?.length) return
    const store = useStore.getState()
    store.pushHistory('Audit auto-fix')
    for (const action of finding.fixActions) {
      const { cellId, formula, value } = action
      if (formula) {
        const formulaStr = formula.startsWith('=') ? formula : `=${formula}`
        store.setCellValue(cellId, null, formulaStr)
      } else if (value !== undefined) {
        store.setCellValue(cellId, value)
      }
    }
    setTimeout(() => handleRunAudit(), 200)
  }, [handleRunAudit])
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/auditor/__tests__/auditor.integration.test.ts`
Expected: PASS (all existing + new test).

Run: `npx eslint src`
Expected: no errors, no warnings.

- [ ] **Step 7: Commit**

```bash
git add src/auditor/types.ts src/auditor/rules/rangeGaps.ts src/auditor/rules/errorCells.ts src/components/panels/AuditPanelContent.tsx src/auditor/__tests__/auditor.integration.test.ts
git commit -m "feat(audit): multi-write fixActions for findings"
```

---


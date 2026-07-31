# Audit Custom Rules & Formula Auto-Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define form-based custom audit rules (persisted to localStorage) and add one-click auto-fixes for magic numbers alongside the existing range-gap and #DIV/0! fixes.

**Architecture:** Extend the existing single-purpose auditor (`src/auditor/`). Add a `customRules.ts` module (type + persistence + evaluation) fed into `runAudit` via an optional third param. Upgrade the fix model from a single `fixAction` write to a `fixActions` array so one finding can write multiple cells (magic-number → input cell + rewritten formula). Add a "Custom Rules" manager section to the existing Auditor panel.

**Tech Stack:** TypeScript, React 18 (Vite), Zustand store, Vitest, ESLint.

## Global Constraints

- No new runtime dependencies. Use existing imports (`@/auditor/types`, `@/auditor/utils`, `@/engine/spreadsheet`'s `letterToCol`/`refToCell`, `@/types`).
- localStorage key for rules: exactly `smartsht-audit-rules`.
- Follow existing code style: 2-space indent, single quotes, trailing commas, `import type` for types.
- Verification commands (run from repo root `D:\spreadsheet\smartsht`): `npx eslint src`, `npx tsc --noEmit`, `npx vitest run`.
- Preserve existing behavior of all current rules and the #DIV/0! IFERROR fix (it ships today via `fixAction`; it must keep working via `fixActions`).
- Do NOT modify `src/types/api.ts` — its `AuditFinding.fixAction` is a separate server-side API type.

---

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

### Task 2: Custom rules engine + persistence + runAudit wiring

**Files:**
- Create: `src/auditor/customRules.ts`
- Modify: `src/auditor/index.ts` (`runAudit` third param, rule loop, exports)
- Test: `src/auditor/customRules.test.ts` (create)

**Interfaces:**
- Consumes: `AuditContext`/`CellInfo`/`AuditRule`/`AuditFinding`/`Severity` from `./types`; `findingId`, `letterToCol` from `./utils`.
- Produces:
  - `type NumericRuleOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'`; `type TextRuleOperator = 'contains' | 'notContains'`; `type EmptyRuleOperator = 'isEmpty' | 'isNotEmpty'`; `type CustomRuleOperator = NumericRuleOperator | TextRuleOperator | EmptyRuleOperator`.
  - `interface CustomAuditRule { id: string; name: string; column: string; operator: CustomRuleOperator; value: string | number; severity: Severity; enabled: boolean }`.
  - `OPERATOR_LABELS: Record<CustomRuleOperator, string>`.
  - `loadCustomRules(): CustomAuditRule[]`, `saveCustomRules(rules: CustomAuditRule[]): void`, `ruleMatches(rule: CustomAuditRule, cell: CellInfo): boolean`, `createCustomAuditRule(rule: CustomAuditRule): AuditRule`.
  - `runAudit(sheet, getComputedValue, customRules: CustomAuditRule[] = []): AuditResult` (backwards compatible).

- [ ] **Step 1: Write the failing test**

Create `src/auditor/customRules.test.ts`:

```ts
/**
 * Unit tests: Custom audit rules engine (evaluation + persistence).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { runAudit } from '../index'
import { loadCustomRules, saveCustomRules } from '../customRules'
import type { CustomAuditRule } from '../customRules'
import type { SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'

function makeSheet(): { sheet: SheetData; getComputedValue: (row: number, col: number) => string } {
  const cells: SheetData['cells'] = {
    'A0': { value: 'Item' },
    'B0': { value: 'Amount' },
    'A1': { value: 'Rent' },
    'B1': { value: 1500 },
    'A2': { value: 'Servers' },
    'B2': { value: 6000 },
    'A3': { value: 'Marketing' },
    'B3': { value: 8200 },
    'A4': { value: 'Note' },
    'B4': { value: 'n/a' },
    'A5': { value: 'Blank label' },
    'B5': { value: '' },
  }
  const sheet: SheetData = {
    id: 'custom-test',
    name: 'Expenses',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
  const getComputedValue = (row: number, col: number) => {
    const cell = cells[refToCell(row, col)]
    return cell?.value == null ? '' : String(cell.value)
  }
  return { sheet, getComputedValue }
}

function rule(overrides: Partial<CustomAuditRule>): CustomAuditRule {
  return {
    id: 'r1',
    name: 'Large expense',
    column: 'B',
    operator: 'gt',
    value: 5000,
    severity: 'high',
    enabled: true,
    ...overrides,
  }
}

describe('custom audit rules', () => {
  it('flags rows whose numeric value exceeds the threshold', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule()])

    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B2', 'B3'])
    expect(findings[0].severity).toBe('high')
    expect(findings[0].autoFixable).toBe(false)
    expect(findings[0].suggestion).toContain('> 5000')
  })

  it('skips non-numeric cells for numeric operators', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule()])
    const matched = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(matched.some((f) => f.cells[0].cellId === 'B4')).toBe(false)
    expect(matched.some((f) => f.cells[0].cellId === 'B5')).toBe(false)
  })

  it('supports the contains text operator', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'A', operator: 'contains', value: 'ark' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['A3'])
  })

  it('supports isEmpty', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ operator: 'isEmpty', value: '' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['B5'])
  })

  it('skips disabled rules', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ enabled: false })])
    expect(result.findings.some((f) => f.ruleId === 'custom:r1')).toBe(false)
  })

  it('skips rules with invalid column letters', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: '!@' })])
    expect(result.findings.some((f) => f.ruleId === 'custom:r1')).toBe(false)
  })

  it('produces no custom findings when no custom rules are passed', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue)
    expect(result.findings.some((f) => f.ruleId === 'custom:r1')).toBe(false)
  })
})

describe('custom audit rules — persistence', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips rules through localStorage', () => {
    expect(loadCustomRules()).toEqual([])
    saveCustomRules([rule()])
    expect(loadCustomRules()).toEqual([rule()])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/auditor/customRules.test.ts`
Expected: FAIL — cannot find module `../customRules`.

- [ ] **Step 3: Create the custom rules module**

Create `src/auditor/customRules.ts`:

```ts
/**
 * Spreadsheet Auditor — Custom User Rules
 *
 * Form-based, domain-specific audit rules defined by users (no code required).
 * Rules are persisted to localStorage and run alongside the built-in rules via
 * runAudit's optional third argument.
 */

import type { Severity, AuditRule, AuditFinding, AuditContext, CellInfo } from './types'
import { findingId, letterToCol } from './utils'

export type NumericRuleOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'
export type TextRuleOperator = 'contains' | 'notContains'
export type EmptyRuleOperator = 'isEmpty' | 'isNotEmpty'
export type CustomRuleOperator = NumericRuleOperator | TextRuleOperator | EmptyRuleOperator

export interface CustomAuditRule {
  id: string
  name: string
  /** Column letter, e.g. "B" */
  column: string
  operator: CustomRuleOperator
  /** Threshold — ignored for isEmpty/isNotEmpty */
  value: string | number
  severity: Severity
  enabled: boolean
}

const STORAGE_KEY = 'smartsht-audit-rules'

export const OPERATOR_LABELS: Record<CustomRuleOperator, string> = {
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  eq: '=',
  neq: '≠',
  contains: 'contains',
  notContains: 'does not contain',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
}

export function loadCustomRules(): CustomAuditRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomRules(rules: CustomAuditRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    // storage unavailable — ignore
  }
}

function compareNumeric(op: NumericRuleOperator, num: number, threshold: number): boolean {
  switch (op) {
    case 'gt': return num > threshold
    case 'lt': return num < threshold
    case 'gte': return num >= threshold
    case 'lte': return num <= threshold
    case 'eq': return num === threshold
    default: return num !== threshold
  }
}

/** True if the cell satisfies the rule's condition. */
export function ruleMatches(rule: CustomAuditRule, cell: CellInfo): boolean {
  switch (rule.operator) {
    case 'contains': {
      const haystack = typeof cell.rawValue === 'string' ? cell.rawValue.toLowerCase() : ''
      return haystack.includes(String(rule.value).toLowerCase())
    }
    case 'notContains': {
      const haystack = typeof cell.rawValue === 'string' ? cell.rawValue.toLowerCase() : ''
      return !haystack.includes(String(rule.value).toLowerCase())
    }
    case 'isEmpty':
      return cell.rawValue === null || cell.rawValue === ''
    case 'isNotEmpty':
      return cell.rawValue !== null && cell.rawValue !== ''
    default: {
      const num = typeof cell.rawValue === 'number' ? cell.rawValue : parseFloat(String(cell.rawValue))
      if (!isFinite(num)) return false
      const threshold = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value))
      if (!isFinite(threshold)) return false
      return compareNumeric(rule.operator, num, threshold)
    }
  }
}

/** Build an AuditRule wrapper that evaluates a custom rule against the sheet. */
export function createCustomAuditRule(rule: CustomAuditRule): AuditRule {
  return {
    id: `custom:${rule.id}`,
    name: rule.name,
    description: `Custom rule: ${rule.name}`,
    defaultSeverity: rule.severity,
    run(ctx: AuditContext): AuditFinding[] {
      const findings: AuditFinding[] = []
      if (!rule.enabled) return findings
      if (!/^[A-Za-z]{1,3}$/.test(rule.column)) return findings
      const col = letterToCol(rule.column)
      if (col < 0) return findings

      for (const cell of ctx.getColumn(col)) {
        if (!ruleMatches(rule, cell)) continue
        const label = OPERATOR_LABELS[rule.operator]
        const hasValue = rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty'
        const valueText = hasValue ? ` ${String(rule.value)}` : ''
        findings.push({
          id: findingId(),
          ruleId: `custom:${rule.id}`,
          severity: rule.severity,
          title: rule.name,
          message: `${cell.cellId}: ${rule.column} ${label}${valueText}`,
          cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
          suggestion: `${rule.name}: ${rule.column} must be ${label}${valueText}`,
          autoFixable: false,
        })
      }
      return findings
    },
  }
}
```

- [ ] **Step 4: Wire custom rules into runAudit**

In `src/auditor/index.ts`:

Add import after the existing `./rules` import:

```ts
import { createCustomAuditRule, type CustomAuditRule } from './customRules'
```

Change the signature (lines 26-29):

```ts
export function runAudit(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): AuditResult {
```

to:

```ts
export function runAudit(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
  customRules: CustomAuditRule[] = [],
): AuditResult {
```

Change the rule-execution loop (lines 92-100):

```ts
  // Execute all rules, catching errors so one bad rule doesn't crash the audit
  const findings: AuditFinding[] = []
  for (const rule of ALL_RULES) {
```

to:

```ts
  // Execute all rules (built-in + custom), catching errors so one bad rule doesn't crash the audit
  const findings: AuditFinding[] = []
  const rules = [...ALL_RULES, ...customRules.map(createCustomAuditRule)]
  for (const rule of rules) {
```

Add exports after the existing re-exports (line 17):

```ts
export { createCustomAuditRule, loadCustomRules, saveCustomRules, ruleMatches, OPERATOR_LABELS } from './customRules'
export type { CustomAuditRule, CustomRuleOperator, NumericRuleOperator, TextRuleOperator, EmptyRuleOperator } from './customRules'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/auditor/customRules.test.ts src/auditor/__tests__/auditor.integration.test.ts`
Expected: PASS (all).

Run: `npx eslint src`
Expected: no errors, no warnings.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/auditor/customRules.ts src/auditor/index.ts src/auditor/customRules.test.ts
git commit -m "feat(audit): custom form-based audit rules with localStorage persistence"
```

---

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

### Task 4: Custom Rules UI in the Auditor panel

**Files:**
- Create: `src/components/panels/CustomRulesSection.tsx`
- Modify: `src/components/panels/AuditPanelContent.tsx`

**Interfaces:**
- Consumes: `loadCustomRules`/`saveCustomRules`/`OPERATOR_LABELS` and types `CustomAuditRule`/`CustomRuleOperator` from `@/auditor/customRules`; `Severity` from `@/auditor/types`; `refToCell`/`letterToCol` from `@/engine/spreadsheet`; `SheetData` from `@/types`.
- Produces: `<CustomRulesSection sheet={SheetData} onRulesChanged={() => void} />`. Calling `onRulesChanged()` after any rule add/edit/toggle/delete; the panel re-runs the audit with the updated rules.

- [ ] **Step 1: Create the component**

Create `src/components/panels/CustomRulesSection.tsx`:

```tsx
/**
 * CustomRulesSection — manages user-defined audit rules.
 * Renders inside the Auditor panel above the findings list.
 */

import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Eye, EyeOff, ChevronDown, ChevronRight, X } from 'lucide-react'
import { loadCustomRules, saveCustomRules, OPERATOR_LABELS } from '@/auditor/customRules'
import type { CustomAuditRule, CustomRuleOperator } from '@/auditor/customRules'
import type { Severity } from '@/auditor/types'
import { refToCell, letterToCol } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'

const OPERATORS: CustomRuleOperator[] = [
  'gt', 'lt', 'gte', 'lte', 'eq', 'neq',
  'contains', 'notContains', 'isEmpty', 'isNotEmpty',
]
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const NUMERIC_OPERATORS = new Set<CustomRuleOperator>(['gt', 'lt', 'gte', 'lte', 'eq', 'neq'])
const VALUE_OPERATORS = new Set<CustomRuleOperator>(['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'contains', 'notContains'])

function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

interface CustomRulesSectionProps {
  sheet: SheetData
  onRulesChanged: () => void
}

export function CustomRulesSection({ sheet, onRulesChanged }: CustomRulesSectionProps) {
  const [rules, setRules] = useState<CustomAuditRule[]>(() => loadCustomRules())
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CustomAuditRule | null>(null)
  const [name, setName] = useState('')
  const [column, setColumn] = useState('A')
  const [operator, setOperator] = useState<CustomRuleOperator>('gt')
  const [value, setValue] = useState('')
  const [severity, setSeverity] = useState<Severity>('high')

  const columns = useMemo(() => {
    const list: Array<{ letter: string; label: string }> = []
    const seen = new Set<number>()
    for (const cellId of Object.keys(sheet.cells)) {
      const m = cellId.match(/^([A-Za-z]{1,3})\d+$/)
      if (!m) continue
      const col = letterToCol(m[1])
      if (seen.has(col)) continue
      seen.add(col)
      const header = sheet.cells[refToCell(0, col)]?.value
      const headerText = typeof header === 'string' && header.trim() ? header.trim() : null
      list.push({
        letter: m[1].toUpperCase(),
        label: headerText ? `${m[1].toUpperCase()} — ${headerText}` : m[1].toUpperCase(),
      })
    }
    return list.sort((a, b) => letterToCol(a.letter) - letterToCol(b.letter))
  }, [sheet])

  const persist = (next: CustomAuditRule[]) => {
    setRules(next)
    saveCustomRules(next)
    onRulesChanged()
  }

  const toggle = (id: string) => {
    persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  const remove = (id: string) => {
    persist(rules.filter((r) => r.id !== id))
  }

  const startEdit = (rule: CustomAuditRule) => {
    setEditing(rule)
    setName(rule.name)
    setColumn(rule.column)
    setOperator(rule.operator)
    setSeverity(rule.severity)
    setValue(rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty' ? '' : String(rule.value))
    setShowForm(true)
  }

  const resetForm = () => {
    setEditing(null)
    setName('')
    setColumn('A')
    setOperator('gt')
    setValue('')
    setSeverity('high')
    setShowForm(false)
  }

  const needsValue = VALUE_OPERATORS.has(operator)
  const numericOp = NUMERIC_OPERATORS.has(operator)

  const handleSubmit = () => {
    if (needsValue && value.trim() === '') return
    const rule: CustomAuditRule = {
      id: editing?.id ?? newId(),
      name: name.trim() || 'Untitled rule',
      column,
      operator,
      value: !needsValue ? '' : numericOp ? Number(value) : value,
      severity,
      enabled: editing?.enabled ?? true,
    }
    const next = editing ? rules.map((r) => (r.id === editing.id ? rule : r)) : [...rules, rule]
    persist(next)
    resetForm()
  }

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <div className="border-b border-slate-100 bg-white/60">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Custom Rules
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px]">
            {enabledCount}
          </span>
        </span>
        <Plus
          size={13}
          className="text-slate-400 hover:text-blue-600"
          onClick={(e) => {
            e.stopPropagation()
            resetForm()
            setShowForm(true)
            setOpen(true)
          }}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {showForm && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                  {editing ? 'Edit Rule' : 'New Rule'}
                </span>
                <button type="button" className="text-slate-400 hover:text-slate-600" onClick={resetForm} aria-label="Close">
                  <X size={13} />
                </button>
              </div>

              <input
                className="w-full px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                placeholder="Rule name (e.g. Large expense)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  value={column}
                  onChange={(e) => setColumn(e.target.value)}
                >
                  {columns.length === 0 && <option value="A">A</option>}
                  {columns.map((c) => (
                    <option key={c.letter} value={c.letter}>{c.label}</option>
                  ))}
                </select>

                <select
                  className="px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as CustomRuleOperator)}
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                  ))}
                </select>
              </div>

              {needsValue && (
                <input
                  className="w-full px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  placeholder={numericOp ? 'Threshold (e.g. 5000)' : 'Text'}
                  type={numericOp ? 'number' : 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}

              <div className="flex items-center gap-2">
                <select
                  className="flex-1 px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-blue-400"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                >
                  {SEVERITIES.map((sev) => (
                    <option key={sev} value={sev}>{sev}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm active:scale-95 disabled:opacity-40"
                  disabled={needsValue && value.trim() === ''}
                  onClick={handleSubmit}
                >
                  {editing ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {rules.length === 0 && !showForm && (
            <p className="text-[10px] text-slate-400 px-1">
              No custom rules. Add one to flag domain-specific issues (e.g. expenses over a threshold).
            </p>
          )}

          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <button
                type="button"
                title={rule.enabled ? 'Enabled' : 'Disabled'}
                className={`p-1 rounded-md ${rule.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
                onClick={() => toggle(rule.id)}
              >
                {rule.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-slate-700 truncate">{rule.name}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {rule.column} {OPERATOR_LABELS[rule.operator]}
                  {rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty' ? ` ${String(rule.value)}` : ''} · {rule.severity}
                </p>
              </div>
              <button type="button" className="p-1 text-slate-400 hover:text-blue-600" title="Edit" onClick={() => startEdit(rule)}>
                <Pencil size={12} />
              </button>
              <button type="button" className="p-1 text-slate-400 hover:text-rose-600" title="Delete" onClick={() => remove(rule.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire the section into AuditPanelContent**

In `src/components/panels/AuditPanelContent.tsx`:

Add imports after the existing imports:

```tsx
import { loadCustomRules } from '@/auditor/customRules'
import { CustomRulesSection } from './CustomRulesSection'
```

Add state after `const [filter, setFilter] = ...`:

```tsx
  const [ruleVersion, setRuleVersion] = useState(0)
```

Change `handleRunAudit` (lines 24-37) to pass custom rules and depend on `ruleVersion`:

```tsx
  const handleRunAudit = useCallback(() => {
    if (!activeSheet) return
    setLoading(true)
    requestAnimationFrame(() => {
      try {
        const auditResult = runAudit(activeSheet, getComputedValue, loadCustomRules())
        setResult(auditResult)
      } catch (err) {
        console.error('Audit failed:', err)
      } finally {
        setLoading(false)
      }
    })
  }, [activeSheet, getComputedValue, ruleVersion])
```

Replace the auto-run effect (lines 40-44):

```tsx
  // Auto-run on first open and whenever custom rules change
  useEffect(() => {
    if (activeSheet && Object.keys(activeSheet.cells).length > 0) {
      handleRunAudit()
    }
  }, [handleRunAudit])
```

(Remove the `// eslint-disable-line react-hooks/exhaustive-deps` comment.)

Insert the section render just before the findings list div (before `<div className="flex-1 overflow-y-auto ...">`):

```tsx
      {activeSheet && (
        <CustomRulesSection
          sheet={activeSheet}
          onRulesChanged={() => setRuleVersion((v) => v + 1)}
        />
      )}
```

- [ ] **Step 3: Verify everything passes**

Run: `npx eslint src`
Expected: no errors, no warnings.

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: all tests pass (custom rules tests + integration tests + the full suite).

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/CustomRulesSection.tsx src/components/panels/AuditPanelContent.tsx
git commit -m "feat(audit): custom rules manager UI in the auditor panel"
```

---

## Verification Checklist (final gate)

- [ ] `npx eslint src` → 0 errors / 0 warnings
- [ ] `npx tsc --noEmit` → clean
- [ ] `npx vitest run` → 397+ tests pass (existing suite + new custom-rules tests + 2 new integration tests)
- [ ] Manual smoke check (if dev server available): Auditor panel shows Custom Rules section; adding a `B > 5000` rule flags matching rows; magic-number finding shows APPLY FIX and writes the constant to the right-side cell; #DIV/0! finding still fixes via IFERROR.

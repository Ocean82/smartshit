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


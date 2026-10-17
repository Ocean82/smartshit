import { describe, expect, it } from 'vitest'
import type { CellData, SheetData } from '@/types'
import { buildMakeoverPlan, roleToNumberFormat } from './sheetMakeover'
import { buildActionPreview } from './previewBuilders'
import { AUTO_APPLY_LOW_RISK_TOOLS } from './applyPosture'
import { buildSheetProfile } from '@/ai/sheetProfile'

// Tools that write cell values/formulas — a makeover must never emit these.
const DATA_WRITING_TOOLS = ['set_cell', 'set_range', 'apply_formula', 'style_recipe', 'clear_sheet', 'modify_column']

function makeSheet(cells: Record<string, CellData>): SheetData {
  return { id: 's1', name: 'Sheet1', cells, columnWidths: {}, rowHeights: {} }
}

// A budget sheet: Date | Category | Budget. The "Budget" header makes
// detectPurpose return 'budget' and inferRole classify it as 'amount'. The
// negative value exercises the conditional-emphasis step.
function budgetSheet(): SheetData {
  return makeSheet({
    A1: { value: 'Date' }, B1: { value: 'Category' }, C1: { value: 'Budget' },
    A2: { value: '2026-01-01' }, B2: { value: 'Rent' }, C2: { value: 1200 },
    A3: { value: '2026-01-02' }, B3: { value: 'Refund' }, C3: { value: -50 },
    A4: { value: '2026-01-03' }, B4: { value: 'Food' }, C4: { value: 300 },
  })
}

// A generic sheet: a label column + a numeric "Value" column. "Value" matches
// no named role regex, so its numeric data infers role 'amount'; the purpose
// stays 'generic', so amount→number (not currency).
function genericSheet(): SheetData {
  return makeSheet({
    A1: { value: 'Widget' }, B1: { value: 'Value' },
    A2: { value: 'alpha' }, B2: { value: 10 },
    A3: { value: 'beta' }, B3: { value: 20 },
  })
}

const computed = (sheet: SheetData) => (r: number, c: number): string => {
  const cell = sheet.cells[`${String.fromCharCode(65 + c)}${r + 1}`]
  return cell?.value == null ? '' : String(cell.value)
}

describe('roleToNumberFormat', () => {
  it('maps non-text roles to their format token', () => {
    expect(roleToNumberFormat('date', 'generic')).toBe('date')
    expect(roleToNumberFormat('percentage', 'generic')).toBe('percent')
    expect(roleToNumberFormat('quantity', 'generic')).toBe('number-int')
  })

  it('amount is currency for money purposes and number for generic', () => {
    expect(roleToNumberFormat('amount', 'budget')).toBe('currency')
    expect(roleToNumberFormat('amount', 'invoice')).toBe('currency')
    expect(roleToNumberFormat('amount', 'inventory')).toBe('currency')
    expect(roleToNumberFormat('amount', 'sales')).toBe('currency')
    expect(roleToNumberFormat('amount', 'generic')).toBe('number')
  })

  it('text roles map to null (no format step)', () => {
    for (const role of ['id', 'category', 'label', 'description', 'unknown'] as const) {
      expect(roleToNumberFormat(role, 'budget')).toBeNull()
    }
  })
})

describe('buildMakeoverPlan — value safety', () => {
  for (const [label, factory] of [['budget', budgetSheet], ['generic', genericSheet]] as const) {
    it(`emits only auto-apply tools and zero data-writing tools (${label} sheet)`, () => {
      const sheet = factory()
      const profile = buildSheetProfile(sheet, computed(sheet))
      const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
      expect(steps.length).toBeGreaterThan(0)
      for (const step of steps) {
        expect(AUTO_APPLY_LOW_RISK_TOOLS.has(step.tool)).toBe(true)
        expect(DATA_WRITING_TOOLS).not.toContain(step.tool)
      }
    })
  }

  it('the execute_macro preview of a built plan writes no cell data', () => {
    const sheet = budgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const preview = buildActionPreview('execute_macro', { steps }, sheet, computed(sheet))
    expect(preview?.changes.length).toBeGreaterThan(0)
    // Value-safe contract: every change leaves BOTH value and formula equal to
    // the cell's CURRENT content — the preview preserves data, never blanks it.
    for (const change of preview!.changes) {
      const current = sheet.cells[change.cell]
      expect(change.newValue).toBe(current?.value ?? null)
      expect(change.newFormula).toBe(current?.formula)
    }
  })
})

describe('buildMakeoverPlan — content', () => {
  it('formats a budget Amount column as currency', () => {
    const sheet = budgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const currencyStep = steps.find(
      (s) => s.tool === 'format_cells' && s.params.numberFormat === 'currency',
    )
    expect(currencyStep).toBeDefined()
    expect(String(currencyStep!.params.range)).toContain('C')
  })

  it('formats a generic numeric column as number, not currency', () => {
    const sheet = genericSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    expect(steps.some((s) => s.params.numberFormat === 'currency')).toBe(false)
    expect(steps.some((s) => s.params.numberFormat === 'number')).toBe(true)
  })

  it('emits a header-styling step and an auto_fit layout step', () => {
    const sheet = budgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    expect(steps[0].tool).toBe('format_cells')
    expect(steps[0].params.bold).toBe(true)
    expect(steps.some((s) => s.tool === 'auto_fit')).toBe(true)
  })

  it('emits at most one conditional-emphasis step on a negative amount', () => {
    const sheet = budgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const conditional = steps.filter((s) => s.tool === 'format_cells' && s.params.condition)
    expect(conditional.length).toBeLessThanOrEqual(1)
  })

  it('returns an empty plan for an empty sheet', () => {
    const empty = makeSheet({})
    const profile = buildSheetProfile(empty, () => '')
    const { steps } = buildMakeoverPlan(empty, profile, () => '')
    expect(steps).toEqual([])
  })
})

describe('buildMakeoverPlan — §3 already-styled guard', () => {
  it('skips a column numberFormat step when every data cell already carries it', () => {
    const sheet = budgetSheet()
    // Pre-format the Amount column (C2:C4) as currency.
    for (const id of ['C2', 'C3', 'C4']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { numberFormat: 'currency' } }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const currencyStep = steps.find((s) => s.params.numberFormat === 'currency')
    expect(currencyStep).toBeUndefined()
  })

  it('skips header styling when the header row already carries it', () => {
    const sheet = budgetSheet()
    // Pre-style the header row (A1:C1) to match what the makeover would set.
    const headerFmt = { bold: true, bgColor: '#166534', borders: { bottom: '2px solid #22c55e' } }
    for (const id of ['A1', 'B1', 'C1']) {
      sheet.cells[id] = { ...sheet.cells[id], format: headerFmt }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const headerStep = steps.find((s) => s.tool === 'format_cells' && s.params.bold === true)
    expect(headerStep).toBeUndefined()
  })
})

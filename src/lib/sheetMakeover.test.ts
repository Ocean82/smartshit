import { describe, expect, it } from 'vitest'
import type { CellData, CellFormat, SheetData } from '@/types'
import { buildMakeoverPlan, roleToNumberFormat } from './sheetMakeover'
import { buildActionPreview } from './previewBuilders'
import { AUTO_APPLY_LOW_RISK_TOOLS } from './applyPosture'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { executeTool, type ExecutionContext } from '@/agent/executor'
import { executeMacro } from '@/ai/macro/macroExecutor'
import type { MacroPlan, UndoManager } from '@/ai/nlp/types'

// Tools that write cell values/formulas — a makeover must never emit these.
// rename_header is here even though it sits in AUTO_APPLY_LOW_RISK_TOOLS:
// handleRenameHeader writes via ctx.setCellValue, so it is data-writing and the
// value-safe makeover must never emit it (findings #10/#11).
const DATA_WRITING_TOOLS = ['set_cell', 'set_range', 'apply_formula', 'style_recipe', 'clear_sheet', 'modify_column', 'rename_header']

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

// A budget sheet whose row 0 is a non-data title and the REAL header is on
// row 1. findHeaderRow returns the first row with >= 2 populated cells, so the
// single-cell title row (A1 only) is skipped and row 1 (A2:C2) is detected as
// the header. The row-0 profile would misclassify these columns; the makeover
// must re-infer roles/purpose from the detected header. (finding #5)
function titledBudgetSheet(): SheetData {
  return makeSheet({
    A1: { value: 'Q1 Budget Report' },
    A2: { value: 'Date' }, B2: { value: 'Category' }, C2: { value: 'Budget' },
    A3: { value: '2026-01-01' }, B3: { value: 'Rent' }, C3: { value: 1200 },
    A4: { value: '2026-01-02' }, B4: { value: 'Food' }, C4: { value: 300 },
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

describe('buildMakeoverPlan — detected header below row 0 (finding #5)', () => {
  it('infers roles/purpose from the DETECTED header row, not row 0', () => {
    const sheet = titledBudgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))

    // The Budget column (C) data lives in C3:C4; with the header detected on
    // row 1, purpose='budget' and role='amount' -> currency on the data rows.
    const currencyStep = steps.find(
      (s) => s.tool === 'format_cells' && s.params.numberFormat === 'currency',
    )
    expect(currencyStep).toBeDefined()
    const range = String(currencyStep!.params.range)
    expect(range).toContain('C')
    // Data rows start at row 2 (1-based row 3), below the detected header.
    expect(range).toBe('C3:C4')

    // Header styling targets the DETECTED header row (row 2, 1-based), not row 1.
    const headerStep = steps.find((s) => s.tool === 'format_cells' && s.params.bold === true)
    expect(headerStep).toBeDefined()
    expect(String(headerStep!.params.range)).toBe('A2:C2')
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

  it('skips header styling when the header row already carries EVERY key', () => {
    const sheet = budgetSheet()
    // Pre-style the header row (A1:C1) to match EVERY key the makeover sets:
    // bold, bgColor, fontColor, and the exact 2px accent bottom border.
    const headerFmt = {
      bold: true,
      bgColor: '#166534',
      fontColor: '#ffffff',
      borders: { bottom: '2px solid #22c55e' },
    }
    for (const id of ['A1', 'B1', 'C1']) {
      sheet.cells[id] = { ...sheet.cells[id], format: headerFmt }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const headerStep = steps.find((s) => s.tool === 'format_cells' && s.params.bold === true)
    expect(headerStep).toBeUndefined()
  })

  it('still styles a header that matches bold+bg but has a DIFFERENT fontColor (finding #8)', () => {
    const sheet = budgetSheet()
    // Correct bold + bg, but a mismatched fontColor -> NOT already styled.
    const headerFmt = {
      bold: true,
      bgColor: '#166534',
      fontColor: '#000000',
      borders: { bottom: '2px solid #22c55e' },
    }
    for (const id of ['A1', 'B1', 'C1']) {
      sheet.cells[id] = { ...sheet.cells[id], format: headerFmt }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const headerStep = steps.find((s) => s.tool === 'format_cells' && s.params.bold === true)
    expect(headerStep).toBeDefined()
  })

  it('still styles a header whose bottom border is 1px, not the 2px accent (finding #8)', () => {
    const sheet = budgetSheet()
    const headerFmt = {
      bold: true,
      bgColor: '#166534',
      fontColor: '#ffffff',
      borders: { bottom: '1px solid #22c55e' },
    }
    for (const id of ['A1', 'B1', 'C1']) {
      sheet.cells[id] = { ...sheet.cells[id], format: headerFmt }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const headerStep = steps.find((s) => s.tool === 'format_cells' && s.params.bold === true)
    expect(headerStep).toBeDefined()
  })
})

// A budget sheet with only non-negative amounts — the negative-emphasis step
// must NOT be emitted (a zero-match conditional format would fail and roll back
// the whole macro). No cell carries textWrap, so auto_fit is a legitimate no-op.
function positiveBudgetSheet(): SheetData {
  return makeSheet({
    A1: { value: 'Date' }, B1: { value: 'Category' }, C1: { value: 'Budget' },
    A2: { value: '2026-01-01' }, B2: { value: 'Rent' }, C2: { value: 1200 },
    A3: { value: '2026-01-02' }, B3: { value: 'Food' }, C3: { value: 300 },
  })
}

describe('buildMakeoverPlan — no-op steps must not roll back the macro (finding #6)', () => {
  it('omits the negative-emphasis step when the amount column has no negatives', () => {
    const sheet = positiveBudgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const conditional = steps.filter((s) => s.tool === 'format_cells' && s.params.condition)
    expect(conditional.length).toBe(0)
    // Styling steps are still present (header + currency + auto_fit).
    expect(steps.some((s) => s.tool === 'format_cells' && s.params.bold === true)).toBe(true)
    expect(steps.some((s) => s.params.numberFormat === 'currency')).toBe(true)
    expect(steps.some((s) => s.tool === 'auto_fit')).toBe(true)
  })

  it('still emits the negative-emphasis step when a negative amount exists', () => {
    const sheet = budgetSheet() // C3 = -50
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const conditional = steps.filter((s) => s.tool === 'format_cells' && s.params.condition)
    expect(conditional.length).toBe(1)
  })

  it('executing the plan on a no-negative, no-wrap sheet SUCCEEDS and keeps the macro committed', async () => {
    const sheet = positiveBudgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))

    // A minimal in-memory ExecutionContext: setCellFormat merges onto the cell,
    // autoFitRows returns 0 (no wrapped content → legitimate no-op). executeTool
    // dispatches each step to the real handlers.
    const ctx: ExecutionContext = {
      getActiveSheet: () => sheet,
      getSheets: () => [sheet],
      getComputedValue: (row, col) => {
        const cell = sheet.cells[`${String.fromCharCode(65 + col)}${row + 1}`]
        return cell?.value == null ? '' : String(cell.value)
      },
      setCellValue: () => { throw new Error('makeover must not write cell values') },
      setCellFormat: (cellId, format: Partial<CellFormat>) => {
        const existing = sheet.cells[cellId] ?? { value: null }
        sheet.cells[cellId] = { ...existing, format: { ...existing.format, ...format } }
      },
      bulkSetCells: () => { throw new Error('makeover must not write cell values') },
      autoFitRows: () => 0, // no wrapped content → nothing resized (the no-op under test)
      applySortPatch: () => {},
      setFilters: () => {},
      deleteRow: () => {},
      insertRow: () => {},
      addSheet: () => {},
      renameSheet: () => ({ ok: false, error: 'not supported in test' }),
      pushHistory: () => {},
      getSelection: () => [],
    }

    let rolledBack = false
    let committed = false
    const undoManager: UndoManager = {
      beginGroup: () => 'g1',
      commitGroup: () => { committed = true },
      rollbackGroup: () => { rolledBack = true },
    }
    const plan: MacroPlan = { steps, originalText: 'professionalize', truncated: false }

    const result = await executeMacro(
      plan,
      { onProgress: () => {}, onStepComplete: () => {}, shouldCancel: () => false },
      undoManager,
      async (step) => {
        const res = executeTool({ tool: step.tool, params: step.params, description: step.description }, ctx)
        return res.success ? { success: true, data: res } : { success: false, error: res.message }
      },
    )

    expect(result.success).toBe(true)
    expect(committed).toBe(true)
    expect(rolledBack).toBe(false)
    // Styling survived: the header row cells carry bold formatting.
    for (const id of ['A1', 'B1', 'C1']) {
      expect(sheet.cells[id].format?.bold).toBe(true)
    }
  })
})

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

  it('amount is accounting-neg for money purposes and number for generic', () => {
    // Finance purposes get the finance convention (red parenthesised negatives
    // + zero-as-dash) via accounting-neg (spec §1.7); generic stays a plain
    // number so we never assume a currency the data may not carry.
    expect(roleToNumberFormat('amount', 'budget')).toBe('accounting-neg')
    expect(roleToNumberFormat('amount', 'invoice')).toBe('accounting-neg')
    expect(roleToNumberFormat('amount', 'inventory')).toBe('accounting-neg')
    expect(roleToNumberFormat('amount', 'sales')).toBe('accounting-neg')
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
  it('formats a budget Amount column as accounting-neg and right-aligns it', () => {
    const sheet = budgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    const amountStep = steps.find(
      (s) => s.tool === 'format_cells' && s.params.numberFormat === 'accounting-neg',
    )
    expect(amountStep).toBeDefined()
    expect(String(amountStep!.params.range)).toContain('C')
    // Numeric money columns are explicitly right-aligned (spec §1.7).
    expect(amountStep!.params.textAlign).toBe('right')
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
    // row 1, purpose='budget' and role='amount' -> accounting-neg on the data rows.
    const amountStep = steps.find(
      (s) => s.tool === 'format_cells' && s.params.numberFormat === 'accounting-neg',
    )
    expect(amountStep).toBeDefined()
    const range = String(amountStep!.params.range)
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
  it('skips the amount numberFormat step when every data cell already carries a user format', () => {
    const sheet = budgetSheet()
    // Pre-format the Amount column (C2:C4) with a DELIBERATE user format
    // (currency) that differs from the house default (accounting-neg). The §3
    // presence-based guard must leave it untouched — no accounting-neg step and
    // no numberFormat/textAlign step on column C at all (no overwrite).
    for (const id of ['C2', 'C3', 'C4']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { numberFormat: 'currency' } }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))
    expect(steps.some((s) => s.params.numberFormat === 'accounting-neg')).toBe(false)
    const touchesC = steps.some(
      (s) => s.params.numberFormat != null && String(s.params.range).includes('C'),
    )
    expect(touchesC).toBe(false)
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

describe('buildMakeoverPlan — §3 respect an already-styled sheet (5 edge cases)', () => {
  // Shared zero-data-write assertion: every emitted step is a format-only
  // auto-apply tool and NONE is on the data-writing denylist (incl. rename_header).
  const assertZeroDataWrite = (steps: ReadonlyArray<{ tool: string }>) => {
    for (const step of steps) {
      expect(AUTO_APPLY_LOW_RISK_TOOLS.has(step.tool)).toBe(true)
      expect(DATA_WRITING_TOOLS).not.toContain(step.tool)
    }
  }

  // The exact keys the header-format step sets for a 'budget' (green) theme.
  const styledHeaderFmt: CellFormat = {
    bold: true,
    bgColor: '#166534',
    fontColor: '#ffffff',
    borders: { bottom: '2px solid #22c55e' },
  }

  it('(1) fully user-styled sheet → minimal/no changes, never overwrites', () => {
    const sheet = budgetSheet()
    // Header fully styled, A given a user date variant, C given a user money
    // format AND a user fill/font — the whole sheet is the user's house style.
    for (const id of ['A1', 'B1', 'C1']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { ...styledHeaderFmt } }
    }
    for (const id of ['A2', 'A3', 'A4']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { numberFormat: 'date-iso' } }
    }
    for (const id of ['C2', 'C3', 'C4']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { numberFormat: 'accounting', bgColor: '#eef2ff', fontColor: '#1e3a8a' } }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps, summary } = buildMakeoverPlan(sheet, profile, computed(sheet))

    // No header step, no numberFormat step, no emphasis step — only layout.
    expect(steps.some((s) => s.tool === 'format_cells' && s.params.bold === true)).toBe(false)
    expect(steps.some((s) => s.params.numberFormat != null)).toBe(false)
    expect(steps.some((s) => s.tool === 'format_cells' && s.params.condition)).toBe(false)
    expect(steps).toEqual([{ tool: 'auto_fit', params: {}, description: expect.any(String) }])
    expect(summary).toBe('This sheet already looks styled — just tidying the layout.')
    assertZeroDataWrite(steps)
  })

  it('(2) partially styled → formats only unformatted columns, leaves formatted ones untouched', () => {
    const sheet = budgetSheet()
    // C (Budget) carries a DELIBERATE non-house token; A (Date) is unformatted.
    for (const id of ['C2', 'C3', 'C4']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { numberFormat: 'accounting' } }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))

    // The old (equality) predicate would have re-applied 'currency' over the
    // user's 'accounting'. Presence-based: C is skipped, A gets its date step.
    const touchesC = steps.some(
      (s) => s.params.numberFormat != null && String(s.params.range).includes('C'),
    )
    expect(touchesC).toBe(false)
    const dateStepForA = steps.find(
      (s) => s.params.numberFormat === 'date' && String(s.params.range).startsWith('A'),
    )
    expect(dateStepForA).toBeDefined()
    assertZeroDataWrite(steps)
  })

  it('(3) unstyled → full house default unchanged (no regression)', () => {
    const sheet = budgetSheet()
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))

    expect(steps.some((s) => s.tool === 'format_cells' && s.params.bold === true)).toBe(true)
    expect(steps.some((s) => s.params.numberFormat === 'accounting-neg' && String(s.params.range).includes('C'))).toBe(true)
    expect(steps.some((s) => s.params.numberFormat === 'date' && String(s.params.range).startsWith('A'))).toBe(true)
    expect(steps.some((s) => s.tool === 'auto_fit')).toBe(true)
    expect(steps.some((s) => s.tool === 'format_cells' && s.params.condition)).toBe(true)
    assertZeroDataWrite(steps)
  })

  it('(4) header already styled → header skipped, unformatted columns still format', () => {
    const sheet = budgetSheet()
    // Header matches EVERY key; data columns remain the user-unset house case.
    for (const id of ['A1', 'B1', 'C1']) {
      sheet.cells[id] = { ...sheet.cells[id], format: { ...styledHeaderFmt } }
    }
    const profile = buildSheetProfile(sheet, computed(sheet))
    const { steps } = buildMakeoverPlan(sheet, profile, computed(sheet))

    // Header step skipped...
    expect(steps.some((s) => s.tool === 'format_cells' && s.params.bold === true)).toBe(false)
    // ...but number formats still run for the unformatted columns.
    expect(steps.some((s) => s.params.numberFormat === 'accounting-neg')).toBe(true)
    expect(steps.some((s) => s.params.numberFormat === 'date')).toBe(true)
    assertZeroDataWrite(steps)
  })

  it('(5) re-running is near-idempotent → second pass emits no format/header steps', () => {
    const sheet = budgetSheet()
    const profile1 = buildSheetProfile(sheet, computed(sheet))
    const { steps: firstSteps } = buildMakeoverPlan(sheet, profile1, computed(sheet))

    // Apply the plan's format_cells steps onto the sheet (merge params into
    // cell.format across each step's range), mirroring the executor.
    const parseRange = (range: string): string[] => {
      const [a, b] = range.split(':')
      const startCol = a.charCodeAt(0)
      const startRow = Number.parseInt(a.slice(1), 10)
      const endCol = (b ?? a).charCodeAt(0)
      const endRow = Number.parseInt((b ?? a).slice(1), 10)
      const ids: string[] = []
      for (let c = startCol; c <= endCol; c++) {
        for (let r = startRow; r <= endRow; r++) ids.push(`${String.fromCharCode(c)}${r}`)
      }
      return ids
    }
    for (const step of firstSteps) {
      if (step.tool !== 'format_cells') continue
      const { range, condition, ...fmt } = step.params as Record<string, unknown>
      if (condition) continue // live conditional emphasis isn't a static cell format
      for (const id of parseRange(String(range))) {
        const existing = sheet.cells[id] ?? { value: null }
        sheet.cells[id] = { ...existing, format: { ...existing.format, ...(fmt as Partial<CellFormat>) } }
      }
    }

    // Second pass on the now-styled sheet: the guards converge — no header,
    // no numberFormat steps (only possibly layout).
    const profile2 = buildSheetProfile(sheet, computed(sheet))
    const { steps: secondSteps } = buildMakeoverPlan(sheet, profile2, computed(sheet))
    expect(secondSteps.some((s) => s.tool === 'format_cells' && s.params.bold === true)).toBe(false)
    expect(secondSteps.some((s) => s.params.numberFormat != null)).toBe(false)
    assertZeroDataWrite(secondSteps)
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
    // Styling steps are still present (header + accounting-neg + auto_fit).
    expect(steps.some((s) => s.tool === 'format_cells' && s.params.bold === true)).toBe(true)
    expect(steps.some((s) => s.params.numberFormat === 'accounting-neg')).toBe(true)
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

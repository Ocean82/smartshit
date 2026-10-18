/**
 * Agent Parser — value-safe "professionalize" makeover wiring (FEAT-002).
 *
 * The general phrase must route to ONE execute_macro call whose steps are
 * allowlist-only and data-free, while the narrow phrases ("bold the headers",
 * "add a total row") keep their existing routing, and a question-framed
 * professionalize request defers to the LLM.
 */

import { describe, expect, it } from 'vitest'
import { parseMessage, type SheetContext } from './parser'
import type { ActionStep } from '@/ai/nlp/types'
import type { CellData, SheetData } from '@/types'
import { buildSheetProfile } from '@/ai/sheetProfile'

// Tools that write cell values/formulas — the makeover macro must emit none.
// rename_header is here even though it sits in AUTO_APPLY_LOW_RISK_TOOLS:
// handleRenameHeader writes via ctx.setCellValue, so it is data-writing and the
// value-safe makeover must never emit it (findings #10/#11).
const DATA_WRITING_TOOLS = ['set_cell', 'set_range', 'apply_formula', 'style_recipe', 'clear_sheet', 'modify_column', 'rename_header']

function makeSheet(cells: Record<string, CellData>): SheetData {
  return { id: 's1', name: 'Sheet1', cells, columnWidths: {}, rowHeights: {} }
}

// Budget sheet: Date | Category | Budget (mirrors sheetMakeover.test.ts).
function budgetSheet(): SheetData {
  return makeSheet({
    A1: { value: 'Date' }, B1: { value: 'Category' }, C1: { value: 'Budget' },
    A2: { value: '2026-01-01' }, B2: { value: 'Rent' }, C2: { value: 1200 },
    A3: { value: '2026-01-02' }, B3: { value: 'Refund' }, C3: { value: -50 },
    A4: { value: '2026-01-03' }, B4: { value: 'Food' }, C4: { value: 300 },
  })
}

const computed = (sheet: SheetData) => (r: number, c: number): string => {
  const cell = sheet.cells[`${String.fromCharCode(65 + c)}${r + 1}`]
  return cell?.value == null ? '' : String(cell.value)
}

/** A full pipeline-shaped context carrying sheet + profile + value accessor. */
function makeoverContext(): SheetContext {
  const sheet = budgetSheet()
  const getComputedValue = computed(sheet)
  const profile = buildSheetProfile(sheet, getComputedValue)
  return {
    headerRow: 0,
    lastDataRow: 3,
    lastDataCol: 2,
    headers: ['Date', 'Category', 'Budget'],
    columns: profile.columns,
    sheet,
    profile,
    getComputedValue,
  }
}

describe('parseMessage — professionalize makeover', () => {
  it('routes a general phrase to ONE execute_macro call with no data-writing/style_recipe steps', () => {
    const result = parseMessage('make this look professional', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].tool).toBe('execute_macro')

    const steps = result.calls[0].params.steps as ActionStep[]
    expect(Array.isArray(steps)).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    for (const step of steps) {
      expect(DATA_WRITING_TOOLS).not.toContain(step.tool)
      expect(step.tool).not.toBe('style_recipe')
    }
  })

  it('surfaces the totals row as a SEPARATE, data-writing, preview-only follow-up', () => {
    const result = parseMessage('clean up the formatting', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0]?.tool).toBe('execute_macro')
    expect(result.explanation).toMatch(/add a totals row/i)
    expect(result.explanation).toMatch(/confirm/i)
  })

  it('defers a question-framed professionalize request to the LLM (no macro)', () => {
    const result = parseMessage('should I make this professional?', makeoverContext())
    expect(result.understood).toBe(false)
    expect(result.calls).toHaveLength(0)
  })

  it('rejects a negated professionalize request (no execute_macro) — finding #9', () => {
    const noMacro = (msg: string) => {
      const result = parseMessage(msg, makeoverContext())
      expect(result.understood).toBe(false)
      expect(result.calls).toHaveLength(0)
      expect(result.calls.some((c) => c.tool === 'execute_macro')).toBe(false)
    }
    noMacro("don't professionalize this")
    noMacro('no need to clean this up')
  })

  it('still builds ONE execute_macro for a genuine makeover command', () => {
    const result = parseMessage('make this look professional', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls.filter((c) => c.tool === 'execute_macro')).toHaveLength(1)
  })

  it('defers when no live sheet/profile is available (minimal context)', () => {
    // Without sheet/profile/getComputedValue the block can't build a safe plan,
    // so it must fall through rather than guess.
    const minimal: SheetContext = {
      headerRow: 0, lastDataRow: 3, lastDataCol: 2, headers: ['Date', 'Category', 'Budget'],
    }
    const result = parseMessage('make this look professional', minimal)
    expect(result.understood).toBe(false)
    expect(result.calls).toHaveLength(0)
  })
})

describe('parseMessage — narrow phrases keep their existing routing', () => {
  it('"bold the headers" still routes to format_cells (not the makeover)', () => {
    const result = parseMessage('bold the headers', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.bold).toBe(true)
  })

  it('"add a total row" still routes to style_recipe total_row', () => {
    const result = parseMessage('add a total row', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('style_recipe')
    expect(result.calls[0].params.recipe).toBe('total_row')
  })

  it('"format this as a table" still routes to format_as_table', () => {
    const result = parseMessage('format this as a table', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('format_as_table')
  })
})

// Q4 styling-catalog (§4) precedence: the newly-cataloged recipe intents defer
// to their narrow Tier-1 recipe when named, so adding the catalog entries did
// NOT shift the makeover-vs-narrow ranking. Recipe entries are router-inert
// (kind:'recipe'); these assert the Tier-1 dispatch the catalog documents.
describe('parseMessage — Q4 catalog intents keep narrow routing (precedence preserved)', () => {
  it('"style the header row" routes to style_recipe header (not the makeover, not plain bold)', () => {
    const result = parseMessage('style the header row', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('style_recipe')
    expect(result.calls[0].params.recipe).toBe('header')
  })

  it('"add a totals row" routes to style_recipe total_row (data-writing recipe, preview-only)', () => {
    const result = parseMessage('add a totals row', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('style_recipe')
    expect(result.calls[0].params.recipe).toBe('total_row')
  })

  it('"polish this table" routes to style_recipe table_polish (data-writing recipe)', () => {
    const result = parseMessage('polish this table', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('style_recipe')
    expect(result.calls[0].params.recipe).toBe('table_polish')
  })

  it('general "make it look nice" still OUT-RANKS the narrow recipes → makeover, no style_recipe step', () => {
    const result = parseMessage('make this look nice', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].tool).toBe('execute_macro')
    const steps = result.calls[0].params.steps as ActionStep[]
    for (const step of steps) expect(step.tool).not.toBe('style_recipe')
  })

  it('"show these as percentages" routes to format_cells numberFormat percent (value-safe)', () => {
    const result = parseMessage('show these as percentages', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.numberFormat).toBe('percent')
  })

  it('"fit the columns" routes to the column auto_fit, NOT the makeover (col-autofit precedence)', () => {
    const result = parseMessage('fit the columns', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].tool).toBe('auto_fit')
    expect(result.calls[0].params).toMatchObject({ target: 'columns' })
  })

  it('general "make it look professional" still routes to the makeover, NOT column-fit (col-autofit precedence)', () => {
    const result = parseMessage('make this look professional', makeoverContext())
    expect(result.understood).toBe(true)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].tool).toBe('execute_macro')
  })
})

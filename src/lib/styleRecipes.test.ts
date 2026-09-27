import { describe, it, expect } from 'vitest'
import type { SheetData } from '@/types'
import { cellToRef } from '@/engine/spreadsheet'
import {
  buildRecipePlan,
  isStyleRecipe,
  planChangeCount,
  planToPreviewChanges,
} from './styleRecipes'

/** A 3-column table: header row 0, data rows 1-3, column B & C numeric. */
function makeTable(): SheetData {
  const cells: SheetData['cells'] = {
    A1: { value: 'Item' }, B1: { value: 'Qty' }, C1: { value: 'Amount' },
    A2: { value: 'Rent' }, B2: { value: 1 }, C2: { value: 1000 },
    A3: { value: 'Food' }, B3: { value: 2 }, C3: { value: 300 },
    A4: { value: 'Gas' }, B4: { value: 1 }, C4: { value: 80 },
  }
  return { id: 's1', name: 'S', cells, columnWidths: {}, rowHeights: {} }
}

const getComputed = (sheet: SheetData) => (row: number, col: number) => {
  const c = sheet.cells[cellToRef(row, col)]
  return c?.value == null ? '' : String(c.value)
}

describe('isStyleRecipe', () => {
  it('accepts the three recipes and rejects others', () => {
    expect(isStyleRecipe('header')).toBe(true)
    expect(isStyleRecipe('total_row')).toBe(true)
    expect(isStyleRecipe('table_polish')).toBe(true)
    expect(isStyleRecipe('bananas')).toBe(false)
    expect(isStyleRecipe(undefined)).toBe(false)
  })
})

describe('buildRecipePlan — header', () => {
  it('styles only the header row', () => {
    const sheet = makeTable()
    const plan = buildRecipePlan('header', sheet, getComputed(sheet))!
    expect(plan).not.toBeNull()
    expect(Object.keys(plan.formatUpdates).sort()).toEqual(['A1', 'B1', 'C1'])
    expect(plan.formatUpdates.A1.bold).toBe(true)
    expect(Object.keys(plan.cellUpdates)).toHaveLength(0)
  })
})

describe('buildRecipePlan — total_row', () => {
  it('adds SUM formulas for numeric columns below the data', () => {
    const sheet = makeTable()
    const plan = buildRecipePlan('total_row', sheet, getComputed(sheet))!
    expect(plan).not.toBeNull()
    // Totals land on row 5 (index 4): A5 label, B5/C5 sums.
    expect(plan.cellUpdates.A5).toMatchObject({ value: 'Total' })
    expect(plan.cellUpdates.B5?.formula).toBe('=SUM(B2:B4)')
    expect(plan.cellUpdates.C5?.formula).toBe('=SUM(C2:C4)')
    // Total row is bolded.
    expect(plan.formatUpdates.B5?.bold).toBe(true)
  })
})

describe('buildRecipePlan — table_polish', () => {
  it('styles header + banded data rows and returns column filters', () => {
    const sheet = makeTable()
    const plan = buildRecipePlan('table_polish', sheet, getComputed(sheet))!
    expect(plan).not.toBeNull()
    // Header + 3 data rows × 3 cols = 12 formatted cells.
    expect(planChangeCount(plan)).toBe(12)
    expect(plan.filters).toEqual([0, 1, 2])
  })
})

describe('buildRecipePlan — empty sheet', () => {
  it('returns null when there is no data range', () => {
    const empty: SheetData = { id: 's', name: 'S', cells: {}, columnWidths: {}, rowHeights: {} }
    expect(buildRecipePlan('header', empty, () => '')).toBeNull()
  })
})

describe('planToPreviewChanges', () => {
  it('emits one change per touched cell with new formulas surfaced', () => {
    const sheet = makeTable()
    const plan = buildRecipePlan('total_row', sheet, getComputed(sheet))!
    const changes = planToPreviewChanges(plan, sheet)
    const c5 = changes.find((c) => c.cell === 'C5')
    expect(c5?.newFormula).toBe('=SUM(C2:C4)')
    expect(changes.length).toBe(planChangeCount(plan))
  })
})

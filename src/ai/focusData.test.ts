import { describe, expect, it } from 'vitest'
import type { SheetData } from '@/types'
import { parseUserIntent } from '@shared/intentParser'
import { buildFocusData, MAX_FOCUS_CHARS } from './focusData'
import { refToCell } from '@/lib/cellRef'

function makeSheet(rows: Array<Array<string | number | null>>, formulas: Record<string, string> = {}) {
  const cells: SheetData['cells'] = {}
  rows.forEach((row, r) => row.forEach((value, c) => {
    if (value !== null) cells[refToCell(r, c)] = { value }
  }))
  for (const [id, formula] of Object.entries(formulas)) cells[id] = { ...(cells[id] ?? { value: null }), formula }
  const sheet = { id: 's1', name: 'Sheet1', cells } as unknown as SheetData
  const computed: Record<string, string> = Object.fromEntries(
    Object.entries(cells).map(([id, cell]) => [id, cell.value == null ? '' : String(cell.value)]),
  )
  const getComputedValue = (row: number, col: number) => computed[refToCell(row, col)] ?? ''
  return { sheet, getComputedValue, computed }
}

const BUDGET = [
  ['Category', 'Budget', 'Actual'],
  ['Rent', 1200, 1200],
  ['Groceries', 400, 450],
  ['Total', null, null],
]

function focus(message: string, rows = BUDGET, formulas: Record<string, string> = {}, computedOverrides: Record<string, string> = {}) {
  const { sheet, getComputedValue, computed } = makeSheet(rows, formulas)
  Object.assign(computed, computedOverrides)
  return buildFocusData({ message, intent: parseUserIntent(message), sheet, getComputedValue })
}

describe('buildFocusData', () => {
  it('returns nothing when the question names no cell or column', () => {
    expect(focus('what stands out to you?')).toBe('')
  })

  it('returns nothing for an empty sheet', () => {
    expect(focus('why is C4 so high?', [])).toBe('')
  })

  it('includes value, header and formula for a named cell', () => {
    const text = focus('why is C4 so high?', BUDGET, { C4: '=SUM(C2:C3)' }, { C4: '1650' })
    expect(text).toContain('C4 (Actual) = 1650 (formula: =SUM(C2:C3))')
  })

  it('accepts lowercase references and skips empty ones', () => {
    const text = focus('compare c3 with Q1 numbers')
    expect(text).toContain('C3 (Actual) = 450')
    expect(text).not.toContain('Q1')
  })

  it('expands a small range', () => {
    const text = focus('explain B2:C3')
    for (const id of ['B2', 'C2', 'B3', 'C3']) expect(text).toContain(`${id} (`)
  })

  it('includes every row of a column named by header, with the label column', () => {
    const text = focus('is the Actual column running hot?')
    expect(text).toContain('Columns named in the question — Actual (C)')
    expect(text).toContain('Row 3: Category=Groceries | Actual=450')
  })

  it('resolves a column given by letter through the intent parser', () => {
    const text = focus('what is going on in column b')
    expect(text).toContain('Budget (B)')
    expect(text).toContain('Budget=400')
  })

  it('does not match a header inside another word', () => {
    expect(focus('my budgetary concerns')).toBe('')
  })

  it('caps the size of very large columns', () => {
    const rows: Array<Array<string | number>> = [['Item', 'Amount']]
    for (let i = 0; i < 2_000; i++) rows.push([`item-${i}-${'x'.repeat(40)}`, i])
    const text = focus('look at the Amount column', rows)

    expect(text.length).toBeLessThanOrEqual(MAX_FOCUS_CHARS + 40)
    expect(text).toContain('[focus data truncated]')
  })

  it('bounds the work for a huge named range', () => {
    const text = focus('summarize A1:ZZ100000')
    expect(text.split('\n').length).toBeLessThanOrEqual(41)
  })
})

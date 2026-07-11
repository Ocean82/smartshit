import { describe, expect, it } from 'vitest'
import { computeSortedCellUpdates } from './sheetSort'
import type { SheetData } from '@/types'

function getComputed(sheet: SheetData) {
  return (row: number, col: number) => {
    const id = `${String.fromCharCode(65 + col)}${row + 1}`
    return String(sheet.cells[id]?.value ?? '')
  }
}

describe('computeSortedCellUpdates', () => {
  it('sorts data rows by numeric column ascending', () => {
    const sheet: SheetData = {
      id: 's1',
      name: 'T',
      cells: {
        A1: { value: 'Name' },
        B1: { value: 'Amount' },
        A2: { value: 'Food' },
        B2: { value: 40 },
        A3: { value: 'Rent' },
        B3: { value: 100 },
        A4: { value: 'Gas' },
        B4: { value: 20 },
      },
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }

    const { writes, deletes } = computeSortedCellUpdates(sheet, 1, 'asc', getComputed(sheet))
    expect(writes.A2?.value).toBe('Gas')
    expect(writes.B2?.value).toBe(20)
    expect(writes.A4?.value).toBe('Rent')
    expect(writes.B4?.value).toBe(100)
    expect(deletes).toEqual([])
  })

  it('clears ghost cells from uneven columns and preserves format', () => {
    const sheet: SheetData = {
      id: 's1',
      name: 'T',
      cells: {
        A1: { value: 'Name' },
        B1: { value: 'Amount' },
        A2: { value: 'Wide', format: { bold: true, bgColor: '#fee' } },
        B2: { value: 10 },
        C2: { value: 'extra', validation: { type: 'list', values: ['a', 'b'] } },
        A3: { value: 'Narrow' },
        B3: { value: 5 },
      },
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }

    const { writes, deletes } = computeSortedCellUpdates(sheet, 1, 'asc', getComputed(sheet))

    // Narrow (5) moves to row 2; Wide (10) to row 3 with C column
    expect(writes.A2?.value).toBe('Narrow')
    expect(writes.B2?.value).toBe(5)
    expect(writes.C2).toBeUndefined()
    expect(writes.A3?.value).toBe('Wide')
    expect(writes.A3?.format?.bold).toBe(true)
    expect(writes.A3?.format?.bgColor).toBe('#fee')
    expect(writes.C3?.value).toBe('extra')
    expect(writes.C3?.validation?.values).toEqual(['a', 'b'])

    // Old C2 must be deleted so it does not ghost after Wide leaves row 2
    expect(deletes).toContain('C2')
  })
})

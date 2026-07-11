import { describe, expect, it } from 'vitest'
import { computeSortedCellUpdates } from './sheetSort'
import type { SheetData } from '@/types'

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

    const getComputed = (row: number, col: number) => {
      const id = `${String.fromCharCode(65 + col)}${row + 1}`
      return String(sheet.cells[id]?.value ?? '')
    }

    const updates = computeSortedCellUpdates(sheet, 1, 'asc', getComputed)
    expect(updates.A2?.value).toBe('Gas')
    expect(updates.B2?.value).toBe(20)
    expect(updates.A4?.value).toBe('Rent')
    expect(updates.B4?.value).toBe(100)
  })
})

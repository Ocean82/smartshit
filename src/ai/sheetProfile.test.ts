import { describe, expect, it } from 'vitest'
import { buildSheetProfile } from './sheetProfile'
import type { SheetData } from '@/types'

const getter = (sheet: SheetData) => (row: number, col: number) => {
  const cellId = `${String.fromCharCode(65 + col)}${row + 1}`
  const val = sheet.cells[cellId]?.value
  return val === null || val === undefined ? '' : String(val)
}

describe('buildSheetProfile', () => {
  it('detects budget purpose from headers', () => {
    const sheet: SheetData = {
      id: 's1',
      name: 'Budget',
      cells: {
        A1: { value: 'Category' },
        B1: { value: 'Budget' },
        C1: { value: 'Actual' },
        A2: { value: 'Rent' },
        B2: { value: 1500 },
        C2: { value: 1600 },
      },
      charts: [],
      filters: [],
      sortConfig: null,
    }

    const profile = buildSheetProfile(sheet, getter(sheet))
    expect(profile.detectedPurpose).toBe('budget')
    expect(profile.hasHeaders).toBe(true)
  })

  it('detects totals row label', () => {
    const sheet: SheetData = {
      id: 's1',
      name: 'Data',
      cells: {
        A1: { value: 'Item' },
        B1: { value: 'Amount' },
        A2: { value: 'A' },
        B2: { value: 10 },
        A3: { value: 'Total' },
        B3: { value: 10 },
      },
      charts: [],
      filters: [],
      sortConfig: null,
    }

    const profile = buildSheetProfile(sheet, getter(sheet))
    expect(profile.hasTotalsRow).toBe(true)
  })
})

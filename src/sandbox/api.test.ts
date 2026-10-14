import { describe, expect, it } from 'vitest'
import { buildHostAPI } from './api'
import { createEmptySheet, refToCell } from '@/engine/spreadsheet'
import type { MutationCollector } from './types'

function emptyMutations(): MutationCollector {
  return {
    cellUpdates: {},
    formatUpdates: {},
    rowDeletions: [],
    rowInsertions: [],
    logs: [],
    mutationCount: 0,
  }
}

describe('sandbox findCells — is_number', () => {
  it('matches numeric cells (incl. currency and percent), excludes text and blanks', () => {
    const sheet = createEmptySheet('S')
    sheet.cells = {
      B1: { value: 100 },
      B2: { value: 'pending' },
      B3: { value: '$1,200' },
      B4: { value: '' },
      B5: { value: '45%' },
      B6: { value: 'N/A' },
    }
    const api = buildHostAPI({
      sheet,
      getComputedValue: (row, col) => String(sheet.cells[refToCell(row, col)]?.value ?? ''),
      mutations: emptyMutations(),
    })

    const matches = api.findCells('B', 'is_number').sort()
    // B1 (100), B3 ($1,200), B5 (45%) are numeric via parseNumericDisplay.
    expect(matches).toEqual(['B1', 'B3', 'B5'])
  })
})

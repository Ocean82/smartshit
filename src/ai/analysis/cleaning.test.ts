import { describe, expect, it } from 'vitest'
import { runCleaningSkill } from './cleaning'
import type { SheetData } from '@/types'

function sheet(cells: SheetData['cells']): SheetData {
  return {
    id: 'sheet',
    name: 'Data',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
}

describe('runCleaningSkill safety', () => {
  it('does not offer a no-op Apply action for already-clean data', () => {
    const result = runCleaningSkill(sheet({
      A1: { value: 'Name' },
      A2: { value: 'Alice' },
    }))
    expect(result.actions).toBeUndefined()
    expect(result.message).toMatch(/already clean/i)
  })

  it('keeps even whitespace-only edits preview-first', () => {
    const result = runCleaningSkill(sheet({
      A1: { value: 'Name' },
      A2: { value: ' Alice ' },
    }))
    expect(result.actions).toHaveLength(1)
    expect(result.actions?.[0].tool).toBe('clean_sheet_data')
    expect(result.actions?.[0].params.previewChanges).toEqual([
      { cell: 'A2', oldValue: ' Alice ', newValue: 'Alice' },
    ])
  })
})

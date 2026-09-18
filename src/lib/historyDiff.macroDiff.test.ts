/**
 * Macro undo now stores a diff, not two full workbook clones.
 *
 * executeMacroAction used to push { structuralBefore, structuralAfter } — two
 * full workbook snapshots — for every successful macro. It now pushes
 * diffWorkbooks(before, after). These tests pin the substitution's contract at
 * the diff level: a cell-only macro yields a lightweight patch that round-trips
 * through undo/redo, while a structural macro still falls back to full snapshots
 * so correctness is preserved.
 */

import { describe, it, expect } from 'vitest'
import { diffWorkbooks, applyUndo, applyRedo, estimatePatchSize } from './historyDiff'
import type { WorkbookData } from '@/types'

function wb(cells: Record<string, { value: unknown }>): WorkbookData {
  return {
    id: 'wb', name: 'W', activeSheetId: 's1', createdAt: 0, updatedAt: 0,
    sheets: [
      { id: 's1', name: 'S1', cells: cells as never, columnWidths: {}, rowHeights: {} },
      { id: 's2', name: 'S2', cells: {}, columnWidths: {}, rowHeights: {} },
    ],
  }
}

describe('macro undo via diffWorkbooks (cell-only change)', () => {
  const before = wb({ A1: { value: 1 }, A2: { value: 2 } })
  const after = wb({ A1: { value: 1 }, A2: { value: 99 }, A3: { value: 3 } })

  it('produces a lightweight, non-structural patch', () => {
    const patch = diffWorkbooks(before, after)
    // No full-workbook snapshots — the whole point of the change.
    expect(patch.structuralBefore).toBeUndefined()
    expect(patch.structuralAfter).toBeUndefined()
    // Only the touched sheet, only the changed cells (A2 changed, A3 added).
    expect(patch.sheets).toHaveLength(1)
    expect(patch.sheets[0].sheetId).toBe('s1')
    expect(patch.sheets[0].cells.map((c) => c.cellId).sort()).toEqual(['A2', 'A3'])
  })

  it('is far smaller than the old two-full-clone entry', () => {
    const diffEntry = { patch: diffWorkbooks(before, after), description: 'Macro: edit' }
    const oldStyle = {
      patch: {
        sheets: [], activeSheetIdBefore: 's1', activeSheetIdAfter: 's1',
        structuralBefore: before, structuralAfter: after,
      },
      description: 'Macro: edit',
    }
    expect(estimatePatchSize(diffEntry)).toBeLessThan(estimatePatchSize(oldStyle))
  })

  it('round-trips through undo then redo', () => {
    const patch = diffWorkbooks(before, after)
    const entry = { patch, description: 'Macro: edit' }

    // Undo: from the after-state back to before.
    const undone = applyUndo(after, entry)
    expect(undone.sheets[0].cells.A2.value).toBe(2)
    expect(undone.sheets[0].cells.A3).toBeUndefined()

    // Redo: reapply to reach after again.
    const redone = applyRedo(undone, entry)
    expect(redone.sheets[0].cells.A2.value).toBe(99)
    expect(redone.sheets[0].cells.A3.value).toBe(3)
  })
})

describe('macro undo via diffWorkbooks (structural change)', () => {
  it('falls back to full snapshots when the sheet list changes', () => {
    const before = wb({ A1: { value: 1 } })
    const after: WorkbookData = {
      ...before,
      sheets: [...before.sheets, { id: 's3', name: 'S3', cells: {}, columnWidths: {}, rowHeights: {} }],
    }
    const patch = diffWorkbooks(before, after)
    // Structural changes can't be cell-diffed safely → full snapshots retained.
    expect(patch.structuralBefore).toBeDefined()
    expect(patch.structuralAfter).toBeDefined()

    // And undo still restores the exact prior document.
    const undone = applyUndo(after, { patch, description: 'Macro: add sheet' })
    expect(undone.sheets).toHaveLength(2)
  })
})

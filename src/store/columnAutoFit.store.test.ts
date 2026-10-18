/**
 * Store-level column auto-fit: the ExecutionContext.autoFitColumns built by
 * buildExecutionContext must write columnWidths, report the changed count, and
 * report a no-op (0) success without touching widths. Mirrors the row path's
 * store wiring.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useStore } from './useStore'
import { buildExecutionContext } from './aiExecution'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { getColWidth } from '@/lib/colLayout'

function seedSheet() {
  const wb = createEmptyWorkbook('Col Autofit')
  const sheet = wb.sheets[0]
  // Column A: a long header forces a width increase; column B empty.
  sheet.cells['A1'] = { value: 'A very long header that should widen the column' }
  sheet.cells['A2'] = { value: 'short' }
  useStore.setState({
    workbook: wb,
    activeSheetId: sheet.id,
    undoStack: [],
    redoStack: [],
  })
  return sheet.id
}

describe('store autoFitColumns (ExecutionContext)', () => {
  beforeEach(seedSheet)

  it('writes columnWidths for a populated column and reports the changed count', () => {
    const ctx = buildExecutionContext(useStore.getState, useStore.setState)
    const changed = ctx.autoFitColumns!([0])
    expect(changed).toBe(1)
    const widths = useStore.getState().getActiveSheet().columnWidths
    // Column A widened above the default; a real px width is now stored.
    expect(getColWidth(widths, 0)).toBeGreaterThan(100)
  })

  it('reports a no-op (0) success when a column needs no change', () => {
    const ctx = buildExecutionContext(useStore.getState, useStore.setState)
    // First fit sets the width; a second fit on the same column is a no-op.
    ctx.autoFitColumns!([0])
    const changedAgain = ctx.autoFitColumns!([0])
    expect(changedAgain).toBe(0)
  })

  it('leaves an empty column unchanged (0 changed)', () => {
    const ctx = buildExecutionContext(useStore.getState, useStore.setState)
    const changed = ctx.autoFitColumns!([1]) // column B has no data
    expect(changed).toBe(0)
    expect(useStore.getState().getActiveSheet().columnWidths[1]).toBeUndefined()
  })

  it('does not push its own history entry (caller owns the undo group)', () => {
    const ctx = buildExecutionContext(useStore.getState, useStore.setState)
    const before = useStore.getState().undoStack.length
    ctx.autoFitColumns!([0])
    expect(useStore.getState().undoStack.length).toBe(before)
  })

  it('writes ZERO cell data — only columnWidths change (value-safe)', () => {
    const cellsBefore = JSON.stringify(useStore.getState().getActiveSheet().cells)
    const ctx = buildExecutionContext(useStore.getState, useStore.setState)
    ctx.autoFitColumns!([0])
    const cellsAfter = JSON.stringify(useStore.getState().getActiveSheet().cells)
    expect(cellsAfter).toBe(cellsBefore)
  })
})

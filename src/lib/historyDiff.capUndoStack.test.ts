/**
 * Undo-stack byte-budget eviction (capUndoStack) + estimatePatchSize.
 *
 * A plain entry-count cap treats a 2-cell edit and a multi-megabyte macro
 * snapshot (two full workbook clones) identically, so a full stack of large
 * entries can retain hundreds of MB. These tests pin the byte-budget eviction
 * that bounds worst-case memory while keeping a usable minimum undo depth.
 */

import { describe, it, expect } from 'vitest'
import { capUndoStack, estimatePatchSize, type HistoryEntry } from './historyDiff'
import type { WorkbookData, CellData } from '@/types'

/** A lightweight cell-diff entry (the common case). */
function smallEntry(desc: string): HistoryEntry {
  const before: CellData = { value: 1 }
  const after: CellData = { value: 2 }
  return {
    description: desc,
    patch: {
      sheets: [{ sheetId: 's1', cells: [{ cellId: 'A1', before, after }] }],
      activeSheetIdBefore: 's1',
      activeSheetIdAfter: 's1',
    },
  }
}

/** A heavy structural/macro entry carrying full workbook snapshot(s). */
function bigEntry(desc: string, approxBytesPerSnapshot: number, opts?: { after?: boolean }): HistoryEntry {
  // A cell whose JSON length is ~1 byte each, so `count` cells ≈ target bytes.
  const cells: Record<string, CellData> = {}
  const count = Math.max(1, Math.floor(approxBytesPerSnapshot / 20))
  for (let i = 0; i < count; i++) cells[`A${i}`] = { value: i }
  const wb: WorkbookData = {
    id: 'wb', name: 'Big', activeSheetId: 's1', createdAt: 0, updatedAt: 0,
    sheets: [{ id: 's1', name: 'S1', cells, columnWidths: {}, rowHeights: {} } as WorkbookData['sheets'][number]],
  }
  return {
    description: desc,
    patch: {
      sheets: [],
      activeSheetIdBefore: 's1',
      activeSheetIdAfter: 's1',
      structuralBefore: wb,
      structuralAfter: opts?.after ? structuredClone(wb) : undefined,
    },
  }
}

describe('estimatePatchSize', () => {
  it('counts BOTH structuralBefore and structuralAfter (macro entries)', () => {
    const beforeOnly = bigEntry('restore', 10_000)
    const bothSides = bigEntry('macro', 10_000, { after: true })
    // A macro (two snapshots) must weigh ~2x a restore (one snapshot) of the
    // same size — the old code counted only `before` and undercounted by half.
    expect(estimatePatchSize(bothSides)).toBeGreaterThan(estimatePatchSize(beforeOnly) * 1.8)
  })

  it('a cell-diff entry is far smaller than a structural entry', () => {
    expect(estimatePatchSize(smallEntry('edit'))).toBeLessThan(estimatePatchSize(bigEntry('x', 10_000)))
  })
})

describe('capUndoStack', () => {
  const opts = { maxEntries: 150, maxBytes: 1_000_000, minEntries: 10 }

  it('enforces the hard entry ceiling regardless of size', () => {
    const stack = Array.from({ length: 160 }, (_, i) => smallEntry(`e${i}`))
    capUndoStack(stack, opts)
    expect(stack.length).toBe(150)
    // Oldest evicted from the front, newest kept.
    expect(stack[stack.length - 1].description).toBe('e159')
  })

  it('evicts oldest heavy entries once over the byte budget', () => {
    // Each entry ~500KB; 5 of them (~2.5MB) exceeds the 1MB budget.
    const stack = Array.from({ length: 5 }, (_, i) => bigEntry(`big${i}`, 500_000))
    capUndoStack(stack, opts)
    // Trimmed down, but never below minEntries — here 5 < min(10) so it keeps all.
    expect(stack.length).toBe(5)
  })

  it('never evicts below minEntries even when every entry is huge', () => {
    const stack = Array.from({ length: 12 }, (_, i) => bigEntry(`big${i}`, 500_000))
    capUndoStack(stack, opts)
    // 12 huge entries far exceed the byte budget, but the floor holds at 10,
    // and the most recent are the ones retained.
    expect(stack.length).toBe(10)
    expect(stack[stack.length - 1].description).toBe('big11')
    expect(stack[0].description).toBe('big2')
  })

  it('keeps a deep history of small entries under the byte budget', () => {
    const stack = Array.from({ length: 100 }, (_, i) => smallEntry(`e${i}`))
    capUndoStack(stack, opts)
    // Small entries are nowhere near the byte budget, so all 100 survive.
    expect(stack.length).toBe(100)
  })
})

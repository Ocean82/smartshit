/**
 * Lightweight diff-based history for undo/redo.
 *
 * Instead of storing full JSON snapshots of the entire workbook on each action,
 * we compute a minimal "patch" capturing only what changed. This reduces memory
 * from O(workbookSize × stackDepth) to O(changedCells × stackDepth).
 *
 * Strategy:
 * - Shallow-diff the workbook object (name, activeSheetId, sheet list changes)
 * - Deep-diff each sheet's `cells` map (only changed cell IDs)
 * - Store both forward and inverse patches so undo/redo are symmetric
 */

import type { WorkbookData, SheetData, CellData } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CellPatch {
  cellId: string
  before: CellData | null // null = cell did not exist
  after: CellData | null  // null = cell was deleted
}

export interface SheetPatch {
  sheetId: string
  cells: CellPatch[]
  /** If the sheet's name or other metadata changed */
  nameBefore?: string
  nameAfter?: string
  colWidthsBefore?: Record<number, number>
  colWidthsAfter?: Record<number, number>
}

export interface WorkbookPatch {
  sheets: SheetPatch[]
  activeSheetIdBefore: string
  activeSheetIdAfter: string
  /** Full before/after for structural changes (add/remove/reorder sheets) */
  structuralBefore?: WorkbookData
  structuralAfter?: WorkbookData
}

export interface HistoryEntry {
  patch: WorkbookPatch
  description: string
}

// ─── Diff Computation ────────────────────────────────────────────────────────

/**
 * Compute a minimal patch between two workbook states.
 * Call this BEFORE applying the mutation (pass the old state as `before`)
 * and AFTER (pass the new state as `after`).
 */
export function diffWorkbooks(before: WorkbookData, after: WorkbookData): WorkbookPatch {
  const patch: WorkbookPatch = {
    sheets: [],
    activeSheetIdBefore: before.activeSheetId,
    activeSheetIdAfter: after.activeSheetId,
  }

  // Detect structural changes (sheets added/removed/reordered)
  const beforeIds = before.sheets.map((s) => s.id)
  const afterIds = after.sheets.map((s) => s.id)
  const isStructuralChange =
    beforeIds.length !== afterIds.length ||
    beforeIds.some((id, i) => id !== afterIds[i])

  if (isStructuralChange) {
    // For structural changes, store full snapshots as fallback
    patch.structuralBefore = before
    patch.structuralAfter = after
    return patch
  }

  // Diff each sheet's cells
  for (let i = 0; i < beforeIds.length; i++) {
    const beforeSheet = before.sheets[i]
    const afterSheet = after.sheets[i]
    const sheetPatch = diffSheet(beforeSheet, afterSheet)

    if (sheetPatch.cells.length > 0 || sheetPatch.nameBefore !== undefined || sheetPatch.colWidthsBefore !== undefined) {
      patch.sheets.push(sheetPatch)
    }
  }

  return patch
}

function diffSheet(before: SheetData, after: SheetData): SheetPatch {
  const patch: SheetPatch = {
    sheetId: before.id,
    cells: [],
  }

  // Name change
  if (before.name !== after.name) {
    patch.nameBefore = before.name
    patch.nameAfter = after.name
  }

  // Column widths change
  const bw = before.columnWidths || {}
  const aw = after.columnWidths || {}
  if (JSON.stringify(bw) !== JSON.stringify(aw)) {
    patch.colWidthsBefore = bw as Record<number, number>
    patch.colWidthsAfter = aw as Record<number, number>
  }

  // Cell-level diff
  const allCellIds = new Set([
    ...Object.keys(before.cells),
    ...Object.keys(after.cells),
  ])

  for (const cellId of allCellIds) {
    const beforeCell = before.cells[cellId] ?? null
    const afterCell = after.cells[cellId] ?? null

    if (beforeCell === afterCell) continue
    if (beforeCell === null && afterCell !== null) {
      patch.cells.push({ cellId, before: null, after: deepCloneCell(afterCell) })
    } else if (beforeCell !== null && afterCell === null) {
      patch.cells.push({ cellId, before: deepCloneCell(beforeCell), after: null })
    } else if (!cellsEqual(beforeCell!, afterCell!)) {
      patch.cells.push({ cellId, before: deepCloneCell(beforeCell!), after: deepCloneCell(afterCell!) })
    }
  }

  return patch
}

// ─── Patch Application ───────────────────────────────────────────────────────

/**
 * Apply a patch to a workbook in the "undo" direction (restore `before` values).
 * Returns a new WorkbookData with the patch reversed.
 */
export function applyUndo(current: WorkbookData, entry: HistoryEntry): WorkbookData {
  const { patch } = entry

  // Structural change — use the full snapshot
  if (patch.structuralBefore) {
    return structuredClone(patch.structuralBefore)
  }

  const wb = structuredClone(current)
  wb.activeSheetId = patch.activeSheetIdBefore

  for (const sheetPatch of patch.sheets) {
    const sheet = wb.sheets.find((s) => s.id === sheetPatch.sheetId)
    if (!sheet) continue

    if (sheetPatch.nameBefore !== undefined) {
      sheet.name = sheetPatch.nameBefore
    }
    if (sheetPatch.colWidthsBefore !== undefined) {
      sheet.columnWidths = sheetPatch.colWidthsBefore
    }

    for (const cellPatch of sheetPatch.cells) {
      if (cellPatch.before === null) {
        delete sheet.cells[cellPatch.cellId]
      } else {
        sheet.cells[cellPatch.cellId] = cellPatch.before
      }
    }
  }

  return wb
}

/**
 * Apply a patch to a workbook in the "redo" direction (restore `after` values).
 * Returns a new WorkbookData with the patch re-applied.
 */
export function applyRedo(current: WorkbookData, entry: HistoryEntry): WorkbookData {
  const { patch } = entry

  // Structural change — use the full snapshot
  if (patch.structuralAfter) {
    return structuredClone(patch.structuralAfter)
  }

  const wb = structuredClone(current)
  wb.activeSheetId = patch.activeSheetIdAfter

  for (const sheetPatch of patch.sheets) {
    const sheet = wb.sheets.find((s) => s.id === sheetPatch.sheetId)
    if (!sheet) continue

    if (sheetPatch.nameAfter !== undefined) {
      sheet.name = sheetPatch.nameAfter
    }
    if (sheetPatch.colWidthsAfter !== undefined) {
      sheet.columnWidths = sheetPatch.colWidthsAfter
    }

    for (const cellPatch of sheetPatch.cells) {
      if (cellPatch.after === null) {
        delete sheet.cells[cellPatch.cellId]
      } else {
        sheet.cells[cellPatch.cellId] = cellPatch.after
      }
    }
  }

  return wb
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function deepCloneCell(cell: CellData): CellData {
  return JSON.parse(JSON.stringify(cell))
}

function cellsEqual(a: CellData, b: CellData): boolean {
  // Fast path: same reference
  if (a === b) return true
  // Compare serialized form (handles nested format objects, validation, etc.)
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Estimate the memory size of a history entry in bytes (rough).
 * Useful for adaptive stack size limits.
 */
export function estimatePatchSize(entry: HistoryEntry): number {
  if (entry.patch.structuralBefore) {
    // Structural patches store full snapshots — estimate via JSON length
    return JSON.stringify(entry.patch.structuralBefore).length * 2
  }
  let size = 0
  for (const sp of entry.patch.sheets) {
    for (const cp of sp.cells) {
      size += cp.cellId.length * 2
      if (cp.before) size += JSON.stringify(cp.before).length
      if (cp.after) size += JSON.stringify(cp.after).length
    }
  }
  return size + entry.description.length
}

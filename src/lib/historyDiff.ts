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
  mergedCellsBefore?: string[]
  mergedCellsAfter?: string[]
  rowHeightsBefore?: Record<number, number>
  rowHeightsAfter?: Record<number, number>
  hiddenRowsBefore?: Record<number, true>
  hiddenRowsAfter?: Record<number, true>
  hiddenColsBefore?: Record<number, true>
  hiddenColsAfter?: Record<number, true>
}

export interface WorkbookPatch {
  sheets: SheetPatch[]
  activeSheetIdBefore: string
  activeSheetIdAfter: string
  updatedAtBefore?: number
  updatedAtAfter?: number
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

  if (before.updatedAt !== after.updatedAt) {
    patch.updatedAtBefore = before.updatedAt
    patch.updatedAtAfter = after.updatedAt
  }

  // Diff each sheet's cells
  for (let i = 0; i < beforeIds.length; i++) {
    const beforeSheet = before.sheets[i]
    const afterSheet = after.sheets[i]
    const sheetPatch = diffSheet(beforeSheet, afterSheet)

    if (sheetPatch.cells.length > 0 || sheetPatch.nameBefore !== undefined || sheetPatch.colWidthsBefore !== undefined || sheetPatch.mergedCellsBefore !== undefined || sheetPatch.rowHeightsBefore !== undefined || sheetPatch.hiddenRowsBefore !== undefined || sheetPatch.hiddenColsBefore !== undefined) {
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

  // Merged cells change
  const bm = before.mergedCells || []
  const am = after.mergedCells || []
  if (JSON.stringify(bm) !== JSON.stringify(am)) {
    patch.mergedCellsBefore = bm
    patch.mergedCellsAfter = am
  }

  // Row heights change
  const br = before.rowHeights || {}
  const ar = after.rowHeights || {}
  if (JSON.stringify(br) !== JSON.stringify(ar)) {
    patch.rowHeightsBefore = br as Record<number, number>
    patch.rowHeightsAfter = ar as Record<number, number>
  }

  const bhr = before.hiddenRows || {}
  const ahr = after.hiddenRows || {}
  if (JSON.stringify(bhr) !== JSON.stringify(ahr)) {
    patch.hiddenRowsBefore = bhr as Record<number, true>
    patch.hiddenRowsAfter = ahr as Record<number, true>
  }

  const bhc = before.hiddenCols || {}
  const ahc = after.hiddenCols || {}
  if (JSON.stringify(bhc) !== JSON.stringify(ahc)) {
    patch.hiddenColsBefore = bhc as Record<number, true>
    patch.hiddenColsAfter = ahc as Record<number, true>
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
  if (patch.updatedAtBefore !== undefined) wb.updatedAt = patch.updatedAtBefore

  for (const sheetPatch of patch.sheets) {
    const sheet = wb.sheets.find((s) => s.id === sheetPatch.sheetId)
    if (!sheet) continue

    if (sheetPatch.nameBefore !== undefined) {
      sheet.name = sheetPatch.nameBefore
    }
    if (sheetPatch.colWidthsBefore !== undefined) {
      sheet.columnWidths = sheetPatch.colWidthsBefore
    }
    if (sheetPatch.mergedCellsBefore !== undefined) {
      if (sheetPatch.mergedCellsBefore.length === 0) delete sheet.mergedCells
      else sheet.mergedCells = sheetPatch.mergedCellsBefore
    }
    if (sheetPatch.rowHeightsBefore !== undefined) {
      sheet.rowHeights = sheetPatch.rowHeightsBefore
    }
    if (sheetPatch.hiddenRowsBefore !== undefined) {
      if (Object.keys(sheetPatch.hiddenRowsBefore).length === 0) delete sheet.hiddenRows
      else sheet.hiddenRows = sheetPatch.hiddenRowsBefore
    }
    if (sheetPatch.hiddenColsBefore !== undefined) {
      if (Object.keys(sheetPatch.hiddenColsBefore).length === 0) delete sheet.hiddenCols
      else sheet.hiddenCols = sheetPatch.hiddenColsBefore
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
  if (patch.updatedAtAfter !== undefined) wb.updatedAt = patch.updatedAtAfter

  for (const sheetPatch of patch.sheets) {
    const sheet = wb.sheets.find((s) => s.id === sheetPatch.sheetId)
    if (!sheet) continue

    if (sheetPatch.nameAfter !== undefined) {
      sheet.name = sheetPatch.nameAfter
    }
    if (sheetPatch.colWidthsAfter !== undefined) {
      sheet.columnWidths = sheetPatch.colWidthsAfter
    }
    if (sheetPatch.mergedCellsAfter !== undefined) {
      if (sheetPatch.mergedCellsAfter.length === 0) delete sheet.mergedCells
      else sheet.mergedCells = sheetPatch.mergedCellsAfter
    }
    if (sheetPatch.rowHeightsAfter !== undefined) {
      sheet.rowHeights = sheetPatch.rowHeightsAfter
    }
    if (sheetPatch.hiddenRowsAfter !== undefined) {
      if (Object.keys(sheetPatch.hiddenRowsAfter).length === 0) delete sheet.hiddenRows
      else sheet.hiddenRows = sheetPatch.hiddenRowsAfter
    }
    if (sheetPatch.hiddenColsAfter !== undefined) {
      if (Object.keys(sheetPatch.hiddenColsAfter).length === 0) delete sheet.hiddenCols
      else sheet.hiddenCols = sheetPatch.hiddenColsAfter
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

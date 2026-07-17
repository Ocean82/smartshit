import type { CellChange, SheetData } from '@/types'
import { cellToRef, refToCell, letterToCol } from '@/engine/spreadsheet'
import { findLastDataRow } from '@/lib/sheetSort'

/**
 * Build CellChange[] previews for proposed mutations (Phase 1 grid overlay).
 * Pattern inspired by temp AgentTools.stageWrite* — adapted to current types.
 */

export function previewSetRange(
  sheet: SheetData,
  startCell: string,
  values: unknown[][],
): CellChange[] {
  const start = cellToRef(startCell.toUpperCase())
  if (!start || !Array.isArray(values)) return []
  const changes: CellChange[] = []

  for (let r = 0; r < values.length; r++) {
    const row = values[r]
    if (!Array.isArray(row)) continue
    for (let c = 0; c < row.length; c++) {
      const cellId = refToCell(start.row + r, start.col + c)
      const current = sheet.cells[cellId]
      const raw = row[c]
      const isFormula = typeof raw === 'string' && raw.startsWith('=')
      changes.push({
        cell: cellId,
        oldValue: current?.value ?? null,
        newValue: isFormula ? null : (raw as string | number | boolean | null),
        oldFormula: current?.formula,
        newFormula: isFormula ? String(raw) : undefined,
      })
    }
  }
  return changes
}

export function previewModifyColumn(
  sheet: SheetData,
  column: string,
  operation: string,
  factor: number,
  getComputedValue: (row: number, col: number) => string,
): CellChange[] {
  if (!Number.isFinite(factor)) return []
  const colIdx = /^[A-Z]+$/i.test(column)
    ? letterToCol(column.toUpperCase())
    : column.charCodeAt(0) - 65
  if (colIdx < 0) return []

  const changes: CellChange[] = []
  const lastRow = findLastDataRow(sheet)

  for (let row = 0; row <= lastRow; row++) {
    const cellId = refToCell(row, colIdx)
    const cell = sheet.cells[cellId]
    if (!cell) continue
    const computed = getComputedValue(row, colIdx)
    const num = parseFloat(computed.replace(/[$,]/g, ''))
    if (isNaN(num)) continue

    let newVal: number
    switch (operation) {
      case 'multiply': newVal = num * factor; break
      case 'add': newVal = num + factor; break
      case 'subtract': newVal = num - factor; break
      case 'divide': newVal = factor !== 0 ? num / factor : num; break
      default: newVal = num
    }
    const rounded = Math.round(newVal * 100) / 100
    changes.push({
      cell: cellId,
      oldValue: cell.value ?? null,
      newValue: rounded,
      oldFormula: cell.formula,
    })
  }
  return changes
}

/** Attach preview.changes onto an action when the tool supports it. */
export function buildActionPreview(
  tool: string,
  params: Record<string, unknown>,
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): { changes: CellChange[] } | undefined {
  if (tool === 'set_range' && Array.isArray(params.values) && typeof params.startCell === 'string') {
    const changes = previewSetRange(sheet, params.startCell, params.values as unknown[][])
    return changes.length ? { changes } : undefined
  }
  if (tool === 'modify_column' && typeof params.column === 'string') {
    const changes = previewModifyColumn(
      sheet,
      params.column,
      String(params.operation ?? 'multiply'),
      Number(params.factor),
      getComputedValue,
    )
    return changes.length ? { changes } : undefined
  }
  // Cleaning and others may already carry previewChanges in params
  if (Array.isArray(params.previewChanges) && params.previewChanges.length > 0) {
    return { changes: params.previewChanges as CellChange[] }
  }
  return undefined
}

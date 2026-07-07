import type { SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import type { ToolResult } from '@/ai/types'

export interface CleaningPreview {
  trimmedCells: number
  duplicateRows: number[]
  normalizedHeaders: Array<{ cell: string; oldValue: string; newValue: string }>
  changes: Array<{ cell: string; oldValue: string | number | null; newValue: string | number | null }>
}

export interface CleaningApplyResult {
  cellUpdates: Record<string, { value: string | number | boolean | null }>
  rowsToDelete: number[]
}

function rowSignature(sheet: SheetData, row: number, maxCol: number): string {
  const parts: string[] = []
  for (let c = 0; c <= maxCol; c++) {
    const val = sheet.cells[refToCell(row, c)]?.value
    parts.push(String(val ?? '').trim().toLowerCase())
  }
  return parts.join('|')
}

export function previewCleaning(sheet: SheetData): CleaningPreview {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }

  const changes: CleaningPreview['changes'] = []
  const normalizedHeaders: CleaningPreview['normalizedHeaders'] = []
  let trimmedCells = 0

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (typeof cell.value === 'string') {
      const trimmed = cell.value.trim()
      if (trimmed !== cell.value) {
        trimmedCells++
        changes.push({ cell: cellId, oldValue: cell.value, newValue: trimmed })
      }
    }
  }

  for (let c = 0; c <= maxCol; c++) {
    const cellId = refToCell(0, c)
    const cell = sheet.cells[cellId]
    if (typeof cell?.value === 'string') {
      const normalized = cell.value.trim().replace(/\s+/g, ' ')
      if (normalized !== cell.value) {
        normalizedHeaders.push({ cell: cellId, oldValue: String(cell.value), newValue: normalized })
        changes.push({ cell: cellId, oldValue: cell.value, newValue: normalized })
      }
    }
  }

  const seen = new Map<string, number>()
  const duplicateRows: number[] = []
  for (let r = 1; r <= maxRow; r++) {
    const sig = rowSignature(sheet, r, maxCol)
    if (!sig.replace(/\|/g, '')) continue
    if (seen.has(sig)) duplicateRows.push(r)
    else seen.set(sig, r)
  }

  return { trimmedCells, duplicateRows, normalizedHeaders, changes }
}

export function applyCleaningChanges(
  sheet: SheetData,
  preview: CleaningPreview,
): CleaningApplyResult {
  const updates: Record<string, { value: string | number | boolean | null }> = {}
  for (const change of preview.changes) {
    updates[change.cell] = { value: change.newValue }
  }
  return {
    cellUpdates: updates,
    rowsToDelete: [...preview.duplicateRows].sort((a, b) => b - a),
  }
}

export function runCleaningSkill(sheet: SheetData): ToolResult {
  const preview = previewCleaning(sheet)

  const message = [
    `Found ${preview.trimmedCells} cells with extra whitespace.`,
    preview.duplicateRows.length > 0
      ? `${preview.duplicateRows.length} duplicate rows will be removed on Apply (rows ${preview.duplicateRows.slice(0, 5).map((r) => r + 1).join(', ')}).`
      : 'No duplicate rows found.',
    preview.normalizedHeaders.length > 0
      ? `Normalized ${preview.normalizedHeaders.length} header cells.`
      : '',
  ].filter(Boolean).join(' ')

  return {
    success: true,
    message,
    data: preview,
    toolUsed: 'cleaning',
    suggestions: ['Click Apply to trim whitespace, normalize headers, and remove duplicate rows.'],
    actions: [{
      tool: 'clean_sheet_data',
      params: {
        preview,
        previewChanges: preview.changes.slice(0, 5).map((c) => ({
          cell: c.cell,
          oldValue: c.oldValue,
          newValue: c.newValue,
        })),
      },
      description: 'Clean whitespace, normalize headers, and remove duplicates',
    }],
  }
}

/**
 * Multi-sheet join tool handler.
 */
import type { SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'
import { findLastDataRow, findLastDataCol } from '@/lib/sheetSort'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, resolveColumnIndex } from './types'
import type { ExecutionContext } from '../executor'

export const handleMultiSheetJoin: ToolHandler = (params, ctx, sheet) => {
  const sourceName = String(params.sourceSheet ?? '')
  const sourceSheet = ctx.getSheets().find((s: SheetData) => s.name === sourceName)
  if (!sourceSheet) {
    return {
      success: false,
      message: `Source sheet "${sourceName}" not found. Available: ${ctx.getSheets().map((s: SheetData) => s.name).join(', ')}`,
      modified: 0,
    }
  }

  const sourceKeyIdx = resolveColumnIndex(String(params.sourceKey ?? ''), sourceSheet, ctx.getComputedValue)
  const targetKeyIdx = resolveColumnIndex(String(params.targetKey ?? ''), sheet, ctx.getComputedValue)
  const colsToCopy = (params.columnsToCopy as string[]) || []

  if (sourceKeyIdx === null || sourceKeyIdx === -1) {
    return { success: false, message: `Source key column "${params.sourceKey}" not found in ${sourceName}`, modified: 0 }
  }
  if (targetKeyIdx === null || targetKeyIdx === -1) {
    return { success: false, message: `Target key column "${params.targetKey}" not found in current sheet`, modified: 0 }
  }

  const sourceMap = buildSourceMap(sourceSheet, sourceKeyIdx, colsToCopy, ctx)
  const { updates, modified } = applyJoinToTarget(sheet, targetKeyIdx, sourceMap, colsToCopy, sourceName, ctx)

  ctx.pushHistory(`Join from ${sourceName}`)
  applyBulk(ctx, updates)
  return { success: true, message: `Joined ${modified} data points from "${sourceName}"`, modified }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Build a lookup map from source sheet: key → { colLetter: value } */
function buildSourceMap(
  sourceSheet: SheetData,
  sourceKeyIdx: number,
  colsToCopy: string[],
  ctx: ExecutionContext,
): Map<string, Record<string, string | number | boolean | null>> {
  const sourceRows = findLastDataRow(sourceSheet) + 1
  const map = new Map<string, Record<string, string | number | boolean | null>>()

  for (let r = 1; r < sourceRows; r++) {
    const key = String(ctx.getComputedValue(r, sourceKeyIdx, sourceSheet.id) ?? '').trim()
    if (!key) continue

    const data: Record<string, string | number | boolean | null> = {}
    for (const colLetter of colsToCopy) {
      const cIdx = resolveColumnIndex(colLetter, sourceSheet, ctx.getComputedValue)
      if (cIdx !== null && cIdx !== -1) {
        data[colLetter] = ctx.getComputedValue(r, cIdx, sourceSheet.id)
      }
    }
    map.set(key, data)
  }

  return map
}

/** Write joined data into target sheet columns. */
function applyJoinToTarget(
  sheet: SheetData,
  targetKeyIdx: number,
  sourceMap: Map<string, Record<string, string | number | boolean | null>>,
  colsToCopy: string[],
  sourceName: string,
  ctx: ExecutionContext,
): { updates: BulkUpdates; modified: number } {
  const targetRows = findLastDataRow(sheet) + 1
  const targetColCount = findLastDataCol(sheet) + 1
  const updates: BulkUpdates = {}
  let modified = 0

  // Map each source column to a target column index
  const colLetterToTargetIdx = new Map<string, number>()
  colsToCopy.forEach((letter, i) => {
    colLetterToTargetIdx.set(letter, targetColCount + i)
    // Add headers
    const headerCellId = refToCell(0, targetColCount + i)
    updates[headerCellId] = { value: `${sourceName} ${letter}` }
  })

  for (let r = 1; r < targetRows; r++) {
    const key = String(ctx.getComputedValue(r, targetKeyIdx) ?? '').trim()
    if (!key) continue

    const sourceData = sourceMap.get(key)
    if (sourceData) {
      for (const letter of colsToCopy) {
        const tIdx = colLetterToTargetIdx.get(letter)!
        const cellId = refToCell(r, tIdx)
        updates[cellId] = { value: sourceData[letter] }
        modified++
      }
    }
  }

  return { updates, modified }
}

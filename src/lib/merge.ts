/**
 * Merged-cell helpers.
 *
 * Merged cells are stored on `SheetData.mergedCells` as canonical range refs
 * (`"A1:B3"`). For backward compatibility with persisted workbooks, a bare anchor
 * ref (`"A1"`) is accepted anywhere and treated as a 1x1 range (a visual no-op).
 */

import { refToCell } from '@/engine/spreadsheet'

export interface MergeRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

const MERGE_RANGE_RE = /^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/

/** Parse a merge ref into 0-based bounds. Bare anchors become 1x1 ranges. */
export function parseMergeRange(ref: string): MergeRange | null {
  const m = MERGE_RANGE_RE.exec(ref)
  if (!m) return null
  const startCol = colIndexFromLetters(m[1])
  const startRow = parseInt(m[2], 10) - 1
  if (startCol < 0 || startRow < 0) return null
  const endCol = m[3] ? colIndexFromLetters(m[3]) : startCol
  const endRow = m[4] ? parseInt(m[4], 10) - 1 : startRow
  if (endCol < 0 || endRow < 0) return null
  return {
    startRow,
    startCol,
    endRow,
    endCol,
  }
}

/** Build a canonical range ref from 0-based bounds. */
export function toMergeRange(startRow: number, startCol: number, endRow: number, endCol: number): string {
  if (startRow < 0 || startCol < 0 || endRow < startRow || endCol < startCol) return ''
  const letterStart = colLettersFromIndex(startCol)
  const letterEnd = colLettersFromIndex(endCol)
  return `${letterStart}${startRow + 1}:${letterEnd}${endRow + 1}`
}

/** Re-emit a merge ref in canonical form (`"B3"` -> `"B3:B3"`). Null if malformed. */
export function normalizeMergeRange(ref: string): string | null {
  const parsed = parseMergeRange(ref)
  if (!parsed) return null
  return toMergeRange(parsed.startRow, parsed.startCol, parsed.endRow, parsed.endCol)
}

export function rangesOverlap(a: MergeRange, b: MergeRange): boolean {
  return a.startRow <= b.endRow && a.endRow >= b.startRow
    && a.startCol <= b.endCol && a.endCol >= b.startCol
}

export interface MergeIndex {
  /** Every covered cell ref (anchor + covered) mapped to its range. */
  byCell: Map<string, MergeRange>
  /** Anchor cell refs mapped to their range. */
  anchors: Map<string, MergeRange>
}

/**
 * Index merged cells for O(1) lookups. Overlapping entries resolve to the
 * earliest range in the list (deterministic).
 */
export function buildMergeIndex(mergedCells: string[] | undefined): MergeIndex {
  const byCell = new Map<string, MergeRange>()
  const anchors = new Map<string, MergeRange>()
  if (!mergedCells) return { byCell, anchors }
  for (const ref of mergedCells) {
    const range = parseMergeRange(ref)
    if (!range) continue
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const cellId = refToCell(r, c)
        if (!byCell.has(cellId)) byCell.set(cellId, range)
      }
    }
    const anchorKey = refToCell(range.startRow, range.startCol)
    if (!anchors.has(anchorKey)) anchors.set(anchorKey, range)
  }
  return { byCell, anchors }
}

export function getMergeAt(index: MergeIndex, row: number, col: number): MergeRange | null {
  return index.byCell.get(refToCell(row, col)) ?? null
}

export function isMergeAnchor(index: MergeIndex, row: number, col: number): boolean {
  return index.anchors.has(refToCell(row, col))
}

function colIndexFromLetters(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.toUpperCase().charCodeAt(i) - 64)
  }
  return n - 1
}

function colLettersFromIndex(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}


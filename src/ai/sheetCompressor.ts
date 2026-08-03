/**
 * SheetCompressor — SpreadsheetLLM-inspired encoding for LLM consumption.
 *
 * Implements three compression modules from the SpreadsheetLLM paper
 * (Dong et al., 2024) to produce token-efficient spreadsheet representations:
 *
 * 1. Structural-anchor extraction — keeps boundary/header rows, drops
 *    homogeneous interior data rows that contribute little to layout understanding.
 * 2. Inverted-index translation — encodes non-empty cells as {value: addresses}
 *    JSON, eliminating empty-cell waste and merging repeated values.
 * 3. Data-format aggregation — clusters adjacent numeric cells by data type
 *    into compact region descriptors (e.g., "B2:B50 → Currency").
 *
 * Usage:
 *   const compressed = compressSheet(sheet, getComputedValue, { mode: 'full' })
 *   // → token-efficient string ready for LLM system/user prompt
 *
 * @module sheetCompressor
 */

import type { SheetData, CellData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { parseNumeric } from '@/ai/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompressorOptions {
  /**
   * Compression mode:
   * - 'full' — all three modules (structural + inverted-index + aggregation)
   * - 'lossless' — inverted-index only (no data loss)
   * - 'structural' — structural anchors + inverted-index (no aggregation)
   */
  mode: 'full' | 'lossless' | 'structural'

  /**
   * Max distance (k) from a structural anchor to retain a row/col.
   * Rows/cols farther than k from any anchor are pruned.
   * Default: 2 (paper recommendation).
   */
  anchorDistance?: number

  /**
   * Maximum number of rows to process. Large sheets are capped here
   * before compression begins. Default: 500.
   */
  maxRows?: number

  /**
   * Maximum number of columns to process. Default: 50.
   */
  maxCols?: number

  /**
   * Whether to include cell addresses in output. Useful for QA tasks.
   * Default: true.
   */
  includeAddresses?: boolean
}

export interface CompressedSheet {
  /** The compressed text encoding (ready for LLM) */
  encoded: string
  /** Original cell count */
  originalCells: number
  /** Cells represented in compressed output */
  compressedCells: number
  /** Approximate compression ratio */
  compressionRatio: number
  /** Structural anchors identified (row/col indexes) */
  anchors?: { rows: number[]; cols: number[] }
}

/** Recognized data type for format aggregation */
type DataType =
  | 'integer'
  | 'float'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'time'
  | 'year'
  | 'email'
  | 'text'
  | 'empty'

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Compress a sheet into a token-efficient encoding for LLM consumption.
 */
export function compressSheet(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
  options: CompressorOptions = { mode: 'full' },
): CompressedSheet {
  const maxRows = options.maxRows ?? 500
  const maxCols = options.maxCols ?? 50
  const k = options.anchorDistance ?? 2
  const includeAddresses = options.includeAddresses ?? true

  // Build the raw cell matrix
  const { matrix, maxRow, maxCol, populatedCount } = buildCellMatrix(
    sheet, getComputedValue, maxRows, maxCols,
  )

  if (populatedCount === 0) {
    return {
      encoded: '{"empty": true}',
      originalCells: 0,
      compressedCells: 0,
      compressionRatio: 1,
    }
  }

  // Step 1: Structural-anchor extraction (if not lossless mode)
  let extractedMatrix = matrix
  let anchorInfo: { rows: number[]; cols: number[] } | undefined
  let rowMapping: number[] | undefined
  let colMapping: number[] | undefined

  if (options.mode !== 'lossless') {
    const extraction = extractStructuralAnchors(matrix, maxRow, maxCol, k)
    extractedMatrix = extraction.compactMatrix
    anchorInfo = { rows: extraction.anchorRows, cols: extraction.anchorCols }
    rowMapping = extraction.retainedRows
    colMapping = extraction.retainedCols
  }

  // Step 2: Inverted-index translation
  const invertedIndex = buildInvertedIndex(
    extractedMatrix, rowMapping, colMapping, includeAddresses,
  )

  // Step 3: Data-format aggregation (if full mode)
  let aggregation: string | undefined
  if (options.mode === 'full') {
    aggregation = buildFormatAggregation(
      extractedMatrix, rowMapping, colMapping,
    )
  }

  // Assemble final encoding
  const encoded = assembleEncoding(invertedIndex, aggregation, anchorInfo)
  const compressedCells = countEncodedCells(invertedIndex)

  return {
    encoded,
    originalCells: populatedCount,
    compressedCells,
    compressionRatio: populatedCount > 0
      ? Math.round((populatedCount / Math.max(compressedCells, 1)) * 10) / 10
      : 1,
    anchors: anchorInfo,
  }
}

/**
 * Quick lossless compression — inverted-index only.
 * Best for small-to-medium sheets where no data loss is acceptable.
 */
export function compressSheetLossless(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): CompressedSheet {
  return compressSheet(sheet, getComputedValue, { mode: 'lossless' })
}

// ─── Module 1: Structural-Anchor Extraction ─────────────────────────────────

interface CellEntry {
  value: string | number | null
  formula?: string
  type: DataType
}

interface ExtractionResult {
  compactMatrix: (CellEntry | null)[][]
  anchorRows: number[]
  anchorCols: number[]
  retainedRows: number[]
  retainedCols: number[]
}

/**
 * Identify structural anchors (heterogeneous boundary rows/columns)
 * and retain only rows/cols within distance k of an anchor.
 */
function extractStructuralAnchors(
  matrix: (CellEntry | null)[][],
  maxRow: number,
  maxCol: number,
  k: number,
): ExtractionResult {
  const rowCount = maxRow + 1
  const colCount = maxCol + 1

  // Compute row heterogeneity: a row is an anchor if it has mixed types
  // or transitions from empty→non-empty (boundary indicator)
  const anchorRows: number[] = []
  for (let r = 0; r < rowCount; r++) {
    if (isStructuralAnchorRow(matrix, r, colCount)) {
      anchorRows.push(r)
    }
  }

  // Compute column heterogeneity
  const anchorCols: number[] = []
  for (let c = 0; c < colCount; c++) {
    if (isStructuralAnchorCol(matrix, c, rowCount)) {
      anchorCols.push(c)
    }
  }

  // Always include row 0 (header) and first/last rows as anchors
  if (!anchorRows.includes(0)) anchorRows.unshift(0)
  if (maxRow > 0 && !anchorRows.includes(maxRow)) anchorRows.push(maxRow)

  // Always include col 0 (labels) and last col
  if (!anchorCols.includes(0)) anchorCols.unshift(0)
  if (maxCol > 0 && !anchorCols.includes(maxCol)) anchorCols.push(maxCol)

  // Retain rows within distance k of any anchor
  const retainedRowSet = new Set<number>()
  for (const anchor of anchorRows) {
    for (let d = -k; d <= k; d++) {
      const r = anchor + d
      if (r >= 0 && r < rowCount) retainedRowSet.add(r)
    }
  }

  // Retain cols within distance k of any anchor
  const retainedColSet = new Set<number>()
  for (const anchor of anchorCols) {
    for (let d = -k; d <= k; d++) {
      const c = anchor + d
      if (c >= 0 && c < colCount) retainedColSet.add(c)
    }
  }

  const retainedRows = [...retainedRowSet].sort((a, b) => a - b)
  const retainedCols = [...retainedColSet].sort((a, b) => a - b)

  // Build compact matrix from retained rows/cols
  const compactMatrix: (CellEntry | null)[][] = []
  for (const r of retainedRows) {
    const row: (CellEntry | null)[] = []
    for (const c of retainedCols) {
      row.push(matrix[r]?.[c] ?? null)
    }
    compactMatrix.push(row)
  }

  return { compactMatrix, anchorRows, anchorCols, retainedRows, retainedCols }
}

/** A row is a structural anchor if it has mixed data types or is a boundary. */
function isStructuralAnchorRow(
  matrix: (CellEntry | null)[][],
  row: number,
  colCount: number,
): boolean {
  const types = new Set<DataType>()
  let nonEmptyCount = 0
  let textCount = 0

  for (let c = 0; c < colCount; c++) {
    const cell = matrix[row]?.[c]
    if (!cell || cell.type === 'empty') continue
    nonEmptyCount++
    types.add(cell.type)
    if (cell.type === 'text') textCount++
  }

  // Empty rows are not anchors
  if (nonEmptyCount === 0) return false

  // Row 0 is always an anchor (likely header)
  if (row === 0) return true

  // Header-like row: mostly text among data columns
  if (textCount >= nonEmptyCount * 0.6 && nonEmptyCount >= 2) return true

  // Boundary: row has different type composition than its neighbors
  if (types.size >= 3) return true

  // Check for transition: previous row has different fill pattern
  if (row > 0) {
    const prevNonEmpty = countNonEmpty(matrix, row - 1, colCount)
    // Transition from empty row to populated row
    if (prevNonEmpty === 0 && nonEmptyCount > 0) return true
    // Significant density change
    if (Math.abs(nonEmptyCount - prevNonEmpty) > colCount * 0.4) return true
  }

  return false
}

/** A column is a structural anchor if it has mixed data types. */
function isStructuralAnchorCol(
  matrix: (CellEntry | null)[][],
  col: number,
  rowCount: number,
): boolean {
  const types = new Set<DataType>()
  let nonEmptyCount = 0
  let textCount = 0

  for (let r = 0; r < rowCount; r++) {
    const cell = matrix[r]?.[col]
    if (!cell || cell.type === 'empty') continue
    nonEmptyCount++
    types.add(cell.type)
    if (cell.type === 'text') textCount++
  }

  if (nonEmptyCount === 0) return false
  if (col === 0) return true // Label column

  // Mostly text (label/category column)
  if (textCount >= nonEmptyCount * 0.7 && nonEmptyCount >= 2) return true

  // Mixed types suggest a boundary column
  if (types.size >= 3) return true

  return false
}

function countNonEmpty(
  matrix: (CellEntry | null)[][],
  row: number,
  colCount: number,
): number {
  let count = 0
  for (let c = 0; c < colCount; c++) {
    const cell = matrix[row]?.[c]
    if (cell && cell.type !== 'empty') count++
  }
  return count
}

// ─── Module 2: Inverted-Index Translation ────────────────────────────────────

interface InvertedEntry {
  value: string
  addresses: string[]
}

/**
 * Build an inverted index: {value → [address1, address2, ...]}
 * Empty cells are excluded. Identical values share one entry.
 */
function buildInvertedIndex(
  matrix: (CellEntry | null)[][],
  rowMapping?: number[],
  colMapping?: number[],
  includeAddresses = true,
): InvertedEntry[] {
  const valueMap = new Map<string, string[]>()

  for (let ri = 0; ri < matrix.length; ri++) {
    const row = matrix[ri]
    if (!row) continue
    for (let ci = 0; ci < row.length; ci++) {
      const cell = row[ci]
      if (!cell || cell.type === 'empty' || cell.value === null || cell.value === '') continue

      const displayValue = cell.formula
        ? cell.formula
        : String(cell.value)

      if (!displayValue.trim()) continue

      const actualRow = rowMapping ? rowMapping[ri] : ri
      const actualCol = colMapping ? colMapping[ci] : ci
      const address = includeAddresses ? refToCell(actualRow, actualCol) : `${ri},${ci}`

      const existing = valueMap.get(displayValue)
      if (existing) {
        existing.push(address)
      } else {
        valueMap.set(displayValue, [address])
      }
    }
  }

  // Convert to sorted entries (most frequent first for readability)
  const entries: InvertedEntry[] = []
  for (const [value, addresses] of valueMap) {
    entries.push({ value, addresses })
  }
  entries.sort((a, b) => b.addresses.length - a.addresses.length)

  return entries
}

/**
 * Collapse consecutive addresses into range notation.
 * e.g., ["B2", "B3", "B4", "B5"] → "B2:B5"
 */
function collapseAddressRanges(addresses: string[]): string[] {
  if (addresses.length <= 1) return addresses

  // Parse addresses
  const parsed = addresses.map(addr => {
    const ref = cellToRef(addr)
    return { addr, row: ref.row, col: ref.col }
  })

  // Sort by column then row
  parsed.sort((a, b) => a.col - b.col || a.row - b.row)

  const ranges: string[] = []
  let rangeStart = parsed[0]
  let rangeLast = parsed[0]

  for (let i = 1; i < parsed.length; i++) {
    const curr = parsed[i]
    // Same column, consecutive row
    if (curr.col === rangeLast.col && curr.row === rangeLast.row + 1) {
      rangeLast = curr
    } else {
      // Flush range
      ranges.push(formatRange(rangeStart, rangeLast))
      rangeStart = curr
      rangeLast = curr
    }
  }
  ranges.push(formatRange(rangeStart, rangeLast))

  return ranges
}

function formatRange(
  start: { row: number; col: number },
  end: { row: number; col: number },
): string {
  const startAddr = refToCell(start.row, start.col)
  if (start.row === end.row && start.col === end.col) return startAddr
  return `${startAddr}:${refToCell(end.row, end.col)}`
}

// ─── Module 3: Data-Format Aggregation ───────────────────────────────────────

interface FormatRegion {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
  dataType: DataType
  sampleValue?: string
}

/**
 * Cluster adjacent cells by data type into rectangular regions.
 * Instead of listing every numeric cell, output "B2:B50 → Currency" etc.
 */
function buildFormatAggregation(
  matrix: (CellEntry | null)[][],
  rowMapping?: number[],
  colMapping?: number[],
): string {
  const rowCount = matrix.length
  if (rowCount === 0) return ''

  const colCount = matrix[0]?.length ?? 0
  const regions: FormatRegion[] = []

  // For each column, find contiguous runs of the same data type
  for (let c = 0; c < colCount; c++) {
    let runStart = -1
    let runType: DataType = 'empty'
    let sampleValue: string | undefined

    for (let r = 0; r < rowCount; r++) {
      const cell = matrix[r]?.[c]
      const type = cell?.type ?? 'empty'

      if (type === runType && type !== 'empty' && type !== 'text') {
        // Continue the run
      } else {
        // Flush previous run if it's a meaningful numeric region
        if (runStart >= 0 && runType !== 'empty' && runType !== 'text' && (r - runStart) >= 3) {
          const actualStartRow = rowMapping ? rowMapping[runStart] : runStart
          const actualEndRow = rowMapping ? rowMapping[r - 1] : r - 1
          const actualCol = colMapping ? colMapping[c] : c
          regions.push({
            startRow: actualStartRow,
            startCol: actualCol,
            endRow: actualEndRow,
            endCol: actualCol,
            dataType: runType,
            sampleValue,
          })
        }
        // Start new run
        runStart = r
        runType = type
        sampleValue = cell?.value != null ? String(cell.value) : undefined
      }
    }

    // Flush final run
    if (runStart >= 0 && runType !== 'empty' && runType !== 'text' && (rowCount - runStart) >= 3) {
      const actualStartRow = rowMapping ? rowMapping[runStart] : runStart
      const actualEndRow = rowMapping ? rowMapping[rowCount - 1] : rowCount - 1
      const actualCol = colMapping ? colMapping[c] : c
      regions.push({
        startRow: actualStartRow,
        startCol: actualCol,
        endRow: actualEndRow,
        endCol: actualCol,
        dataType: runType,
        sampleValue,
      })
    }
  }

  if (regions.length === 0) return ''

  // Format regions as compact text
  const lines = regions.map(r => {
    const start = refToCell(r.startRow, r.startCol)
    const end = refToCell(r.endRow, r.endCol)
    const range = start === end ? start : `${start}:${end}`
    const sample = r.sampleValue ? ` (e.g. ${r.sampleValue})` : ''
    return `${range}:${r.dataType}${sample}`
  })

  return lines.join('; ')
}

// ─── Encoding Assembly ───────────────────────────────────────────────────────

function assembleEncoding(
  invertedIndex: InvertedEntry[],
  aggregation?: string,
  anchors?: { rows: number[]; cols: number[] },
): string {
  const parts: string[] = []

  // Header with metadata
  if (anchors) {
    parts.push(`[anchors] rows:${anchors.rows.length} cols:${anchors.cols.length}`)
  }

  // Inverted index as compact JSON-like format
  if (invertedIndex.length > 0) {
    const indexLines: string[] = []
    for (const entry of invertedIndex) {
      const collapsed = collapseAddressRanges(entry.addresses)
      const addrStr = collapsed.join(',')
      // Truncate very long value strings
      const val = entry.value.length > 80
        ? entry.value.slice(0, 77) + '...'
        : entry.value
      indexLines.push(`"${val}":${addrStr}`)
    }
    parts.push(`[cells]\n${indexLines.join('\n')}`)
  }

  // Format aggregation regions
  if (aggregation) {
    parts.push(`[regions] ${aggregation}`)
  }

  return parts.join('\n')
}

function countEncodedCells(index: InvertedEntry[]): number {
  return index.reduce((sum, entry) => sum + entry.addresses.length, 0)
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function buildCellMatrix(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
  maxRows: number,
  maxCols: number,
): { matrix: (CellEntry | null)[][]; maxRow: number; maxCol: number; populatedCount: number } {
  let maxRow = 0
  let maxCol = 0

  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    maxRow = Math.max(maxRow, ref.row)
    maxCol = Math.max(maxCol, ref.col)
  }

  // Cap dimensions
  maxRow = Math.min(maxRow, maxRows - 1)
  maxCol = Math.min(maxCol, maxCols - 1)

  const matrix: (CellEntry | null)[][] = Array.from(
    { length: maxRow + 1 },
    () => Array(maxCol + 1).fill(null),
  )

  let populatedCount = 0

  for (const [cellId, cellData] of Object.entries(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.row > maxRow || ref.col > maxCol) continue

    const computed = getComputedValue(ref.row, ref.col)
    const rawValueRaw = cellData.formula
      ? (computed || cellData.value)
      : cellData.value

    if (rawValueRaw === null || rawValueRaw === undefined || rawValueRaw === '') continue

    // Coerce booleans to string for the cell matrix
    const rawValue: string | number = typeof rawValueRaw === 'boolean'
      ? String(rawValueRaw)
      : rawValueRaw as string | number

    const type = classifyDataType(rawValue, cellData)
    matrix[ref.row][ref.col] = {
      value: rawValue,
      formula: cellData.formula || undefined,
      type,
    }
    populatedCount++
  }

  return { matrix, maxRow, maxCol, populatedCount }
}

/**
 * Classify a cell's data type for format aggregation.
 * Maps values to: integer, float, currency, percentage, date, time, year, email, text
 */
function classifyDataType(
  value: string | number | boolean | null,
  cellData?: CellData,
): DataType {
  if (value === null || value === undefined || value === '') return 'empty'

  // Check number format string from cell format (most reliable)
  const nfs = cellData?.format?.numberFormat
  if (nfs) {
    if (/[$€£¥]|#,##0/.test(nfs)) return 'currency'
    if (/%/.test(nfs)) return 'percentage'
    if (/[ymd]{2,}/i.test(nfs) || /date/i.test(nfs)) return 'date'
    if (/[hms]{2,}/i.test(nfs) || /time/i.test(nfs)) return 'time'
  }

  const str = String(value).trim()

  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) return 'email'

  // Currency: starts with $, €, £, ¥ or ends with currency symbol
  if (/^[$€£¥]\s*[\d,]+\.?\d*$/.test(str) || /^[\d,]+\.?\d*\s*[$€£¥]$/.test(str)) return 'currency'

  // Percentage
  if (/^-?\d+\.?\d*\s*%$/.test(str)) return 'percentage'

  // Date patterns
  if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(str)) return 'date'
  if (/^\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}$/.test(str)) return 'date'
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(str) && /\d/.test(str)) return 'date'

  // Time
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s*[ap]m)?$/i.test(str)) return 'time'

  // Year (4-digit number between 1900-2100)
  if (/^(19|20)\d{2}$/.test(str)) return 'year'

  // Numeric
  const num = parseNumeric(value)
  if (num !== null) {
    return Number.isInteger(num) ? 'integer' : 'float'
  }

  return 'text'
}

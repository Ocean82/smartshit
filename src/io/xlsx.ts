import * as XLSX from 'xlsx'
import { v4 as uuid } from 'uuid'
import type { WorkbookData, SheetData, CellData } from '@/types'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import {
  createEmptyWorkbook,
  createEmptySheet,
  refToCell,
  cellToRef,
} from '@/engine/spreadsheet'
import { cellScalar } from '@/lib/formatUtils'

export interface WorkbookImportMeta {
  appliedMaxRows: number
  appliedMaxCols: number
  sheetLimitHits: Array<{
    sheetName: string
    originalRows: number
    originalCols: number
    importedRows: number
    importedCols: number
  }>
  warnings: string[]
}

export interface WorkbookImportResult {
  workbook: WorkbookData
  meta: WorkbookImportMeta
}

function sheetToMatrix(sheet: SheetData): (string | number | null)[][] {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    maxRow = Math.max(maxRow, ref.row)
    maxCol = Math.max(maxCol, ref.col)
  }

  const rows = Math.max(maxRow + 1, 1)
  const cols = Math.max(maxCol + 1, 1)
  const matrix: (string | number | null)[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null),
  )

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    const ref = cellToRef(cellId)
    const display = cell.formula ?? cell.value
    matrix[ref.row][ref.col] = cellScalar(display)
  }

  return matrix
}

function parseSheetRows(
  rows: (string | number | boolean | null)[][],
  maxRows: number,
  maxCols: number,
): {
  cells: Record<string, CellData>
  importedRows: number
  importedCols: number
} {
  const cells: Record<string, CellData> = {}
  const importedRows = Math.min(rows.length, maxRows)
  let importedCols = 0
  rows.slice(0, importedRows).forEach((row, rowIndex) => {
    const rowImportedCols = Math.min(row.length, maxCols)
    importedCols = Math.max(importedCols, rowImportedCols)
    row.slice(0, rowImportedCols).forEach((value, colIndex) => {
      if (value === undefined || value === null || value === '') return
      const cellId = refToCell(rowIndex, colIndex)
      // With raw: true, values come as native types (number, boolean, string)
      if (typeof value === 'number' || typeof value === 'boolean') {
        cells[cellId] = { value }
      } else if (typeof value === 'string') {
        if (value.startsWith('=')) {
          cells[cellId] = { value: null, formula: value }
        } else {
          // Try to coerce string to number only if it looks numeric
          const num = Number(value)
          cells[cellId] = { value: (value !== '' && Number.isFinite(num)) ? num : value }
        }
      }
    })
  })
  return { cells, importedRows, importedCols }
}

/** Keys that can poison Object.prototype if copied onto a plain object. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Check if a SheetJS format string appears to be a date/time format.
 * This catches cases where mapExcelNumFmt might miss date formats
 * (e.g., custom date formats or locale-specific patterns).
 */
function isExcelDateFormatId(fmt: string | undefined): boolean {
  if (!fmt || fmt === 'General') return false
  // Strip locale blocks
  const stripped = fmt.replace(/\[\$[^\]]*\]/g, '').toLowerCase()
  // Check for date/time tokens that aren't part of number formats
  const hasDateTokens = /[dmy]/.test(stripped) && !/[#0]/.test(stripped)
  const hasTimeTokens = /[h]/.test(stripped) && /[ms]/.test(stripped) && !/[#0]/.test(stripped)
  return hasDateTokens || hasTimeTokens
}

/**
 * Extract a hex color string from an XLSX color object.
 * Handles rgb, argb, theme-based colors.
 */
function extractColorHex(color: { rgb?: string; argb?: string; theme?: number; tint?: number } | undefined): string | null {
  if (!color) return null
  // ARGB format (8 chars: AARRGGBB) — strip alpha
  if (color.argb && color.argb.length === 8) {
    return '#' + color.argb.slice(2)
  }
  // RGB format (6 chars)
  if (color.rgb && color.rgb.length >= 6) {
    return '#' + color.rgb.slice(0, 6)
  }
  return null
}

/** Returns true if the color is effectively white/default and shouldn't be imported as a bg */
function isDefaultBg(hex: string): boolean {
  const lower = hex.toLowerCase()
  return lower === '#ffffff' || lower === '#000000'
}

/**
 * Map an Excel number format string to the app's internal format key.
 * Excel numFmt examples: "0.00%", "#,##0", "$#,##0.00", "0%"
 * 
 * IMPORTANT: Excel uses [$-xxx] syntax for locale identifiers (e.g. [$-409] for US English).
 * These contain '$' but are NOT currency formats. We strip them before checking for currency symbols.
 */
function mapExcelNumFmt(fmt: string): string | null {
  // Strip locale/conditional blocks like [$-409], [$-F800], [$USD-409] before analysis
  const stripped = fmt.replace(/\[\$[^\]]*\]/g, '')
  const lower = stripped.toLowerCase()
  
  // Date formats — check BEFORE currency because some date formats include locale blocks with $
  // Check for date-specific patterns: d, m, y tokens (but not when they're part of number formats)
  if ((lower.includes('d') || lower.includes('m') || lower.includes('y')) && !lower.includes('#') && !lower.includes('0')) {
    if (lower.includes('yyyy') && lower.includes('mm') && lower.includes('dd')) return 'date-iso'
    if (lower.includes('mmm') && lower.includes('d')) return 'date-d-mmm'
    if (lower.includes('d') && lower.includes('m') && lower.includes('y')) return 'date'
    return 'date'
  }
  
  // Time formats  
  if (lower.includes('h') && lower.includes('m') && !lower.includes('d') && !lower.includes('y')) {
    if (lower.includes('ss')) return 'time-seconds'
    if (lower.includes('am') || lower.includes('pm')) return 'time'
    return 'time-24'
  }

  // Percentage formats
  if (lower.includes('%')) {
    if (lower.includes('.')) return 'percent'
    return 'percent-int'
  }
  // Currency formats — only check the stripped string (locale identifiers removed)
  if (stripped.includes('$') || stripped.includes('€') || stripped.includes('£') || stripped.includes('¥')) {
    if (stripped.includes('€')) return 'currency-eur'
    if (stripped.includes('£')) return 'currency-gbp'
    if (stripped.includes('¥')) return 'currency-jpy'
    if (lower.includes('.00') || lower.includes('.##')) return 'currency'
    return 'currency-int'
  }
  // Accounting (parentheses for negatives)
  if (lower.includes('(') && lower.includes(')') && (lower.includes('#') || lower.includes('0'))) {
    return 'accounting-neg'
  }
  // Number with decimals and thousands separator
  if ((lower.includes('#,##0') || lower.includes('#,###')) && (lower.includes('.00') || lower.includes('.##'))) {
    return 'number'
  }
  // Integer with thousands separator
  if (lower.includes('#,##0') || lower.includes('#,###')) {
    return 'number-int'
  }
  // Scientific
  if (lower.includes('e+') || lower.includes('e-')) return 'scientific'
  return null
}

/**
 * Map an XLSX border definition to a CSS-like border string.
 */
function mapBorderStyle(border: { style?: string; color?: { rgb?: string; argb?: string } }): string {
  const weight = border.style === 'thick' ? '2px' : border.style === 'medium' ? '1.5px' : '1px'
  let color = '#000000'
  if (border.color) {
    const hex = extractColorHex(border.color)
    if (hex) color = hex
    else color = '#d1d5db' // neutral gray fallback
  }
  return `${weight} solid ${color}`
}

/**
 * Strip prototype-polluting keys from a parsed workbook.
 *
 * The pinned `xlsx@0.18.5` carries an unpatched prototype-pollution advisory
 * (GHSA-4r6h-8v6p-xvw6, fixed in >=0.19.3, which is not published to npm —
 * SheetJS moved to its own CDN after 0.18.5). Until the dependency is migrated,
 * sanitise the parse output so a crafted file cannot reach Object.prototype
 * through sheet names or cell addresses.
 */
function stripUnsafeKeys<T extends object>(value: T): T {
  for (const key of UNSAFE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      (value as Record<string, unknown>)[key] = undefined
    }
  }
  return value
}

export async function importWorkbookFromFileWithMeta(file: File): Promise<WorkbookImportResult> {
  const buffer = await file.arrayBuffer()
  const book = XLSX.read(buffer, { type: 'array', cellStyles: true, cellFormula: true })

  // Harden the parsed structures before we iterate over them (see above).
  stripUnsafeKeys(book.Sheets)
  for (const sheetName of Object.keys(book.Sheets)) {
    const parsedSheet = book.Sheets[sheetName]
    if (parsedSheet && typeof parsedSheet === 'object') stripUnsafeKeys(parsedSheet)
  }
  book.SheetNames = book.SheetNames.filter((name) => !UNSAFE_KEYS.has(name))
  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, '')
  const maxRows = AI_ANALYSIS_CONFIG.maxImportRows
  const maxCols = AI_ANALYSIS_CONFIG.maxImportCols

  const sheetLimitHits: WorkbookImportMeta['sheetLimitHits'] = []

  const sheets: SheetData[] = book.SheetNames.map((name) => {
    const sheet = createEmptySheet(name.slice(0, 31))
    const ws = book.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    })
    const originalRows = rows.length
    const originalCols = rows.reduce((max, row) => Math.max(max, row.length), 0)
    const parsed = parseSheetRows(rows, maxRows, maxCols)
    sheet.cells = parsed.cells

    // Extract formulas, background colors, and borders from raw cell objects
    if (ws) {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      for (let r = range.s.r; r <= Math.min(range.e.r, maxRows - 1); r++) {
        for (let c = range.s.c; c <= Math.min(range.e.c, maxCols - 1); c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const rawCell = ws[addr]
          if (!rawCell) continue

          const cellId = refToCell(r, c)

          // Extract formula — preserve Excel's computed value as fallback
          if (rawCell.f) {
            const formula = '=' + rawCell.f
            // rawCell.v holds the value Excel computed before saving
            const computedValue = rawCell.v ?? null
            if (!sheet.cells[cellId]) {
              sheet.cells[cellId] = { value: computedValue, formula }
            } else {
              sheet.cells[cellId].formula = formula
              // Keep Excel's computed value so the cell shows something meaningful
              // even if our engine can't evaluate the formula
              if (computedValue !== null && computedValue !== undefined) {
                sheet.cells[cellId].value = computedValue
              }
            }
          }

          // Extract number format from rawCell.z (available even without cellStyles)
          if (rawCell.z && typeof rawCell.z === 'string' && rawCell.z !== 'General') {
            const mappedFormat = mapExcelNumFmt(rawCell.z)
            if (mappedFormat) {
              if (!sheet.cells[cellId]) {
                sheet.cells[cellId] = { value: rawCell.v ?? null, format: { numberFormat: mappedFormat } }
              } else {
                sheet.cells[cellId].format = { ...sheet.cells[cellId].format, numberFormat: mappedFormat }
              }
            }
          }

          // Detect date cells via SheetJS cell type 't' === 'd' or via known date format IDs
          // SheetJS uses 't' field: 'n' = number, 's' = string, 'b' = boolean, 'd' = date
          if (rawCell.t === 'd' || (rawCell.t === 'n' && isExcelDateFormatId(rawCell.z))) {
            const cell = sheet.cells[cellId]
            if (cell && !cell.format?.numberFormat) {
              if (!cell.format) cell.format = {}
              cell.format.numberFormat = 'date'
            }
          }

          // Extract styles (background color, borders)
          if (rawCell.s) {
            const style = rawCell.s
            const format: Record<string, unknown> = {}

            // Number format — from rawCell.z or style.numFmt
            const numFmt = rawCell.z || style.numFmt?.fmt || style.numFmt
            if (numFmt && typeof numFmt === 'string') {
              const mappedFormat = mapExcelNumFmt(numFmt)
              if (mappedFormat) format.numberFormat = mappedFormat
            }

            // Background color
            if (style.fgColor || style.bgColor || style.fill?.fgColor || style.fill?.bgColor) {
              const fg = style.fill?.fgColor || style.fgColor
              const bg = style.fill?.bgColor || style.bgColor
              const colorSource = fg || bg
              if (colorSource) {
                const hex = extractColorHex(colorSource)
                if (hex && !isDefaultBg(hex)) format.bgColor = hex
              }
            }

            // Font color
            if (style.font?.color) {
              const hex = extractColorHex(style.font.color)
              if (hex) format.fontColor = hex
            }

            // Bold/Italic
            if (style.font?.bold) format.bold = true
            if (style.font?.italic) format.italic = true

            // Borders
            if (style.border) {
              const borders: Record<string, string> = {}
              if (style.border.top?.style) borders.top = mapBorderStyle(style.border.top)
              if (style.border.right?.style) borders.right = mapBorderStyle(style.border.right)
              if (style.border.bottom?.style) borders.bottom = mapBorderStyle(style.border.bottom)
              if (style.border.left?.style) borders.left = mapBorderStyle(style.border.left)
              if (Object.keys(borders).length > 0) format.borders = borders
            }

            // Text alignment
            if (style.alignment?.horizontal) {
              const align = style.alignment.horizontal
              if (align === 'left' || align === 'center' || align === 'right') {
                format.textAlign = align
              }
            }

            // Apply format to cell
            if (Object.keys(format).length > 0) {
              if (!sheet.cells[cellId]) {
                sheet.cells[cellId] = { value: null, format: format as CellData['format'] }
              } else {
                sheet.cells[cellId].format = { ...sheet.cells[cellId].format, ...format } as CellData['format']
              }
            }
          }
        }
      }
    }

    if (originalRows > parsed.importedRows || originalCols > parsed.importedCols) {
      sheetLimitHits.push({
        sheetName: name,
        originalRows,
        originalCols,
        importedRows: parsed.importedRows,
        importedCols: parsed.importedCols,
      })
    }

    // Extract column widths from Excel's !cols metadata
    if (ws && (ws as Record<string, unknown>)['!cols']) {
      const cols = (ws as Record<string, unknown>)['!cols'] as Array<{ wpx?: number; wch?: number; width?: number } | undefined>
      const columnWidths: Record<number, number> = {}
      for (let i = 0; i < Math.min(cols.length, maxCols); i++) {
        const colDef = cols[i]
        if (!colDef) continue
        // wpx = width in pixels; wch = width in characters; width = width in Excel's character units
        if (colDef.wpx && colDef.wpx > 0) {
          columnWidths[i] = Math.round(colDef.wpx)
        } else if (colDef.wch && colDef.wch > 0) {
          // Approximate pixel width from character width (1 char ≈ 7.5px + 5px padding)
          columnWidths[i] = Math.round(colDef.wch * 7.5 + 5)
        } else if (colDef.width && colDef.width > 0) {
          columnWidths[i] = Math.round(colDef.width * 7.5 + 5)
        }
      }
      if (Object.keys(columnWidths).length > 0) {
        sheet.columnWidths = columnWidths
      }
    }

    // Extract row heights from Excel's !rows metadata
    if (ws && (ws as Record<string, unknown>)['!rows']) {
      const rows = (ws as Record<string, unknown>)['!rows'] as Array<{ hpx?: number; hpt?: number } | undefined>
      const rowHeights: Record<number, number> = {}
      for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
        const rowDef = rows[i]
        if (!rowDef) continue
        // hpx = height in pixels; hpt = height in points
        if (rowDef.hpx && rowDef.hpx > 0) {
          rowHeights[i] = Math.round(rowDef.hpx)
        } else if (rowDef.hpt && rowDef.hpt > 0) {
          // Convert points to pixels (1pt ≈ 1.333px)
          rowHeights[i] = Math.round(rowDef.hpt * 1.333)
        }
      }
      if (Object.keys(rowHeights).length > 0) {
        sheet.rowHeights = rowHeights
      }
    }

    // Extract merged cell regions — anchor (top-left) ref for each merge
    if (ws && (ws as Record<string, unknown>)['!merges']) {
      const merges = (ws as Record<string, unknown>)['!merges'] as Array<{ s: { r: number; c: number } }>
      const refs: string[] = []
      for (const merge of merges) {
        if (!merge?.s) continue
        const { r, c } = merge.s
        if (r >= maxRows || c >= maxCols) continue
        refs.push(refToCell(r, c))
      }
      if (refs.length > 0) sheet.mergedCells = refs
    }

    return sheet
  })

  const warnings: string[] = sheetLimitHits.map((hit) => (
    `Imported sheet "${hit.sheetName}" with limits ${hit.importedRows}/${hit.originalRows} rows and ${hit.importedCols}/${hit.originalCols} columns.`
  ))

  if (!sheets.length) {
    return {
      workbook: createEmptyWorkbook(baseName),
      meta: {
        appliedMaxRows: maxRows,
        appliedMaxCols: maxCols,
        sheetLimitHits,
        warnings,
      },
    }
  }

  return {
    workbook: {
      id: uuid(),
      name: baseName,
      sheets,
      activeSheetId: sheets[0].id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    meta: {
      appliedMaxRows: maxRows,
      appliedMaxCols: maxCols,
      sheetLimitHits,
      warnings,
    },
  }
}

export async function importWorkbookFromFile(file: File): Promise<WorkbookData> {
  const result = await importWorkbookFromFileWithMeta(file)
  return result.workbook
}

export function exportWorkbookToXlsx(workbook: WorkbookData, filename?: string): void {
  const book = XLSX.utils.book_new()
  for (const sheet of workbook.sheets) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(sheetToMatrix(sheet)),
      sheet.name.slice(0, 31),
    )
  }
  const safeName = (filename ?? workbook.name).replace(/[^\w\s-]/g, '').trim() || 'workbook'
  XLSX.writeFile(book, `${safeName}.xlsx`)
}

export function exportSheetToCsv(sheet: SheetData, filename: string): void {
  const matrix = sheetToMatrix(sheet)
  const csv = matrix.map((row) =>
    row
      .map((cell) => {
        const val = cell == null ? '' : String(cell)
        return val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')
          ? `"${val.replace(/"/g, '""')}"`
          : val
      })
      .join(','),
  ).join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

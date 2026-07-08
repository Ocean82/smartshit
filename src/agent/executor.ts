/**
 * Agent Executor — runs parsed tool calls against the spreadsheet store.
 * This is the "Kiro for spreadsheets" execution engine.
 * 
 * Flow: User message → Parser → Executor → Store mutations → Response
 */

import type { ParsedToolCall } from './parser'
import { refToCell, cellToRef, colToLetter } from '@/engine/spreadsheet'
import type { SheetData, CellData } from '@/types'

export interface ExecutionContext {
  getActiveSheet: () => SheetData
  getComputedValue: (row: number, col: number) => string
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellFormat: (cellId: string, format: Record<string, unknown>) => void
  bulkSetCells: (cells: Record<string, { value: string | number | boolean | null; formula?: string }>) => void
  deleteRow: (row: number) => void
  insertRow: (afterRow: number) => void
  addSheet: (name?: string) => void
  renameSheet: (sheetId: string, name: string) => void
  pushHistory: (desc: string) => void
}

export interface ExecutionResult {
  success: boolean
  message: string
  modified: number  // Number of cells affected
}

/**
 * Execute a single tool call against the spreadsheet.
 */
export function executeTool(call: ParsedToolCall, ctx: ExecutionContext): ExecutionResult {
  const { tool, params } = call
  const sheet = ctx.getActiveSheet()

  switch (tool) {
    case 'set_cell': {
      const cell = (params.cell as string).toUpperCase()
      const value = params.value as string
      ctx.pushHistory(`Set ${cell}`)
      if (value.startsWith('=')) {
        ctx.setCellValue(cell, null, value)
      } else {
        const num = parseFloat(value.replace(/[$,]/g, ''))
        ctx.setCellValue(cell, !isNaN(num) && /^[\$\d,.-]+$/.test(value) ? num : value)
      }
      return { success: true, message: `Set ${cell} to "${value}"`, modified: 1 }
    }

    case 'set_range': {
      const startCell = (params.startCell as string).toUpperCase()
      const values = params.values as unknown[][]
      const ref = cellToRef(startCell)
      ctx.pushHistory('Set range')
      let count = 0
      for (let r = 0; r < values.length; r++) {
        const row = values[r]
        if (!Array.isArray(row)) continue
        for (let c = 0; c < row.length; c++) {
          const cellId = refToCell(ref.row + r, ref.col + c)
          const val = row[c]
          if (typeof val === 'string' && val.startsWith('=')) {
            ctx.setCellValue(cellId, null, val)
          } else {
            ctx.setCellValue(cellId, val as string | number | null)
          }
          count++
        }
      }
      return { success: true, message: `Filled ${count} cells`, modified: count }
    }

    case 'add_row': {
      const values = params.values as (string | number)[]
      const lastRow = findLastDataRow(sheet)
      const targetRow = (params.afterRow as number | undefined) ?? lastRow + 1
      ctx.pushHistory('Add row')
      let count = 0
      for (let c = 0; c < values.length; c++) {
        const cellId = refToCell(targetRow, c)
        const val = values[c]
        if (typeof val === 'string' && val.startsWith('=')) {
          ctx.setCellValue(cellId, null, val)
        } else {
          ctx.setCellValue(cellId, val)
        }
        count++
      }
      return { success: true, message: `Added row ${targetRow + 1} with ${count} values`, modified: count }
    }

    case 'delete_row': {
      if (params.row != null) {
        const row = (params.row as number) - 1 // Convert 1-indexed to 0-indexed
        ctx.pushHistory(`Delete row ${params.row}`)
        ctx.deleteRow(row)
        return { success: true, message: `Deleted row ${params.row}`, modified: 1 }
      }
      if (params.match) {
        const matchText = (params.match as string).toLowerCase()
        const row = findRowByContent(sheet, matchText)
        if (row >= 0) {
          ctx.pushHistory(`Delete row containing "${params.match}"`)
          ctx.deleteRow(row)
          return { success: true, message: `Deleted row containing "${params.match}"`, modified: 1 }
        }
        return { success: false, message: `Could not find a row containing "${params.match}"`, modified: 0 }
      }
      return { success: false, message: 'No row specified', modified: 0 }
    }

    case 'rename_header': {
      const col = (params.column as string).toUpperCase()
      const newName = params.newName as string
      const colIdx = col.charCodeAt(0) - 65
      // Find the header row (usually row 0 or first row with content)
      const headerRow = findHeaderRow(sheet)
      const cellId = refToCell(headerRow, colIdx)
      ctx.pushHistory(`Rename column ${col}`)
      ctx.setCellValue(cellId, newName)
      return { success: true, message: `Renamed column ${col} to "${newName}"`, modified: 1 }
    }

    case 'apply_formula': {
      const target = (params.cell as string).toUpperCase()
      const formula = params.formula as string
      ctx.pushHistory(`Apply formula`)

      // If target is a single column letter (e.g., "B"), put formula at bottom
      if (target.length === 1 && /^[A-Z]$/.test(target)) {
        const colIdx = target.charCodeAt(0) - 65
        const lastRow = findLastDataRowInCol(sheet, colIdx)
        const targetRow = lastRow + 1
        const cellId = refToCell(targetRow, colIdx)
        // Build full formula if just function name
        const fullFormula = formula.includes('(')
          ? formula
          : `${formula}(${target}2:${target}${lastRow + 1})`
        ctx.setCellValue(cellId, null, fullFormula)
        return { success: true, message: `Added ${formula} formula in ${cellId}`, modified: 1 }
      }

      // Otherwise target is a cell reference
      ctx.setCellValue(target, null, formula)
      return { success: true, message: `Set formula in ${target}`, modified: 1 }
    }

    case 'modify_column': {
      const col = (params.column as string).toUpperCase()
      const operation = params.operation as string
      const factor = params.factor as number
      const colIdx = col.charCodeAt(0) - 65
      ctx.pushHistory(`Modify column ${col}`)

      let count = 0
      for (const [cellId, cell] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId)
        if (ref.col !== colIdx) continue
        const computed = ctx.getComputedValue(ref.row, ref.col)
        const num = parseFloat(computed)
        if (isNaN(num)) continue

        let newVal: number
        switch (operation) {
          case 'multiply': newVal = num * factor; break
          case 'add': newVal = num + factor; break
          case 'subtract': newVal = num - factor; break
          case 'divide': newVal = factor !== 0 ? num / factor : num; break
          default: newVal = num
        }
        ctx.setCellValue(cellId, Math.round(newVal * 100) / 100)
        count++
      }
      return { success: true, message: `Modified ${count} cells in column ${col}`, modified: count }
    }

    case 'sort_sheet': {
      const col = (params.column as string).toUpperCase()
      const direction = (params.direction as string) || 'asc'
      const colIdx = col.charCodeAt(0) - 65
      const headerRow = findHeaderRow(sheet)
      ctx.pushHistory(`Sort by column ${col}`)

      // Collect data rows (after header)
      const rows: Array<{ row: number; sortVal: number | string; cells: Record<string, CellData> }> = []
      const lastRow = findLastDataRow(sheet)

      for (let r = headerRow + 1; r <= lastRow; r++) {
        const computed = ctx.getComputedValue(r, colIdx)
        const num = parseFloat(computed.replace(/[$,]/g, ''))
        const sortVal = isNaN(num) ? computed.toLowerCase() : num
        const rowCells: Record<string, CellData> = {}
        for (const [cellId, cell] of Object.entries(sheet.cells)) {
          const ref = cellToRef(cellId)
          if (ref.row === r) rowCells[cellId] = { ...cell }
        }
        rows.push({ row: r, sortVal, cells: rowCells })
      }

      // Sort
      rows.sort((a, b) => {
        if (typeof a.sortVal === 'number' && typeof b.sortVal === 'number') {
          return direction === 'asc' ? a.sortVal - b.sortVal : b.sortVal - a.sortVal
        }
        const aStr = String(a.sortVal)
        const bStr = String(b.sortVal)
        return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
      })

      // Rewrite cells in sorted order
      let count = 0
      for (let i = 0; i < rows.length; i++) {
        const targetRow = headerRow + 1 + i
        const srcCells = rows[i].cells
        for (const [cellId, cell] of Object.entries(srcCells)) {
          const ref = cellToRef(cellId)
          const newCellId = refToCell(targetRow, ref.col)
          ctx.setCellValue(newCellId, cell.value, cell.formula)
          count++
        }
      }

      return { success: true, message: `Sorted ${rows.length} rows by column ${col} (${direction})`, modified: count }
    }

    case 'format_range': {
      const range = params.range as string
      const format: Record<string, unknown> = {}
      if (params.bold) format.bold = true
      if (params.bgColor) format.bgColor = params.bgColor
      if (params.fontColor) format.fontColor = params.fontColor
      if (params.fontSize) format.fontSize = params.fontSize

      ctx.pushHistory('Format cells')
      const cells = expandRange(range)
      for (const cellId of cells) {
        ctx.setCellFormat(cellId, format)
      }
      return { success: true, message: `Formatted ${cells.length} cells`, modified: cells.length }
    }

    case 'conditional_format': {
      const col = (params.column as string).toUpperCase()
      const condition = String(params.condition ?? 'negative').toLowerCase()
      const threshold = typeof params.value === 'number' ? params.value : 0
      const color = typeof params.color === 'string' ? params.color : '#FEE2E2'
      const colIdx = col.charCodeAt(0) - 65
      ctx.pushHistory(`Conditional format ${col}`)

      let count = 0
      for (const [cellId] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId)
        if (ref.col !== colIdx) continue
        const computed = ctx.getComputedValue(ref.row, ref.col)
        const num = Number(computed.replace(/[$,\s]/g, ''))
        if (!Number.isFinite(num)) continue

        const shouldHighlight = (
          (condition === 'negative' && num < 0)
          || (condition === 'positive' && num > 0)
          || (condition === 'gt' && num > threshold)
          || (condition === 'lt' && num < threshold)
          || (condition === 'eq' && num === threshold)
        )
        if (!shouldHighlight) continue

        ctx.setCellFormat(cellId, { bgColor: color })
        count++
      }

      return { success: true, message: `Applied conditional formatting to ${count} cells in column ${col}`, modified: count }
    }

    case 'clear_sheet': {
      ctx.pushHistory('Clear sheet')
      const cellIds = Object.keys(sheet.cells)
      for (const cellId of cellIds) {
        ctx.setCellValue(cellId, null)
      }
      return { success: true, message: 'Sheet cleared', modified: cellIds.length }
    }

    case 'rename_sheet': {
      const name = params.name as string
      ctx.renameSheet(sheet.id, name)
      return { success: true, message: `Sheet renamed to "${name}"`, modified: 0 }
    }

    case 'find_and_replace': {
      const find = (params.find as string).toLowerCase()
      const replace = params.replace as string
      ctx.pushHistory(`Replace "${find}" → "${replace}"`)
      let count = 0
      for (const [cellId, cell] of Object.entries(sheet.cells)) {
        if (cell.value != null && String(cell.value).toLowerCase().includes(find)) {
          const newVal = String(cell.value).replace(new RegExp(find, 'gi'), replace)
          ctx.setCellValue(cellId, newVal)
          count++
        }
      }
      return { success: true, message: `Replaced ${count} occurrence(s)`, modified: count }
    }

    case 'find_max':
    case 'find_min': {
      const col = (params.column as string).toUpperCase()
      const colIdx = col.charCodeAt(0) - 65
      const isMax = tool === 'find_max'
      let best: { val: number; row: number; label: string } | null = null

      for (const [cellId] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId)
        if (ref.col !== colIdx) continue
        const computed = ctx.getComputedValue(ref.row, ref.col)
        const num = parseFloat(computed.replace(/[$,]/g, ''))
        if (isNaN(num)) continue
        if (!best || (isMax ? num > best.val : num < best.val)) {
          const label = ctx.getComputedValue(ref.row, 0) || `Row ${ref.row + 1}`
          best = { val: num, row: ref.row, label }
        }
      }

      if (best) {
        const desc = isMax ? 'highest' : 'lowest'
        return { success: true, message: `The ${desc} value in column ${col} is $${best.val.toLocaleString()} (${best.label}, row ${best.row + 1})`, modified: 0 }
      }
      return { success: false, message: `No numeric values found in column ${col}`, modified: 0 }
    }

    default:
      return { success: false, message: `Unknown tool: ${tool}`, modified: 0 }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findLastDataRow(sheet: SheetData): number {
  let max = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.row > max) max = ref.row
  }
  return max
}

function findLastDataRowInCol(sheet: SheetData, colIdx: number): number {
  let max = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.col === colIdx && ref.row > max) max = ref.row
  }
  return max
}

function findHeaderRow(sheet: SheetData): number {
  // Usually row 0 or the first row that has multiple cells
  for (let r = 0; r < 5; r++) {
    let count = 0
    for (const cellId of Object.keys(sheet.cells)) {
      const ref = cellToRef(cellId)
      if (ref.row === r) count++
    }
    if (count >= 2) return r
  }
  return 0
}

function findRowByContent(sheet: SheetData, text: string): number {
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.value != null && String(cell.value).toLowerCase().includes(text)) {
      return cellToRef(cellId).row
    }
  }
  return -1
}

function expandRange(range: string): string[] {
  // Handle "A1:D1" style ranges
  const match = range.match(/^([A-Z])(\d+):([A-Z])(\d+)$/i)
  if (!match) {
    // Single cell or column
    if (/^[A-Z]$/i.test(range)) {
      // Full column — just format first 30 rows
      const col = range.toUpperCase().charCodeAt(0) - 65
      return Array.from({ length: 30 }, (_, i) => refToCell(i, col))
    }
    return [range.toUpperCase()]
  }

  const startCol = match[1].toUpperCase().charCodeAt(0) - 65
  const startRow = parseInt(match[2]) - 1
  const endCol = match[3].toUpperCase().charCodeAt(0) - 65
  const endRow = parseInt(match[4]) - 1
  const cells: string[] = []

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      cells.push(refToCell(r, c))
    }
  }
  return cells
}

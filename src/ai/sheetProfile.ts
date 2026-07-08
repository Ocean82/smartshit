import type { SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import type { ColumnProfile, ColumnRole, SheetProfile, SheetPurpose } from '@/ai/types'

function parseNumeric(value: string | number | boolean | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '')
    const num = Number(cleaned)
    if (cleaned !== '' && Number.isFinite(num)) return num
  }
  return null
}

function inferRole(header: string, values: (string | number | null)[]): ColumnRole {
  const h = header.toLowerCase()
  if (/date|month|year|due/.test(h)) return 'date'
  if (/category|item|description|name|vendor|merchant/.test(h)) return 'category'
  if (/amount|actual|cost|price|total|spent|budget|income|revenue|salary/.test(h)) return 'amount'
  if (/qty|quantity|units|count/.test(h)) return 'quantity'
  if (/id|sku|code/.test(h)) return 'id'
  if (/%|percent|rate/.test(h)) return 'percentage'

  const numericCount = values.filter((v) => parseNumeric(v) !== null).length
  if (numericCount > values.length * 0.7) return 'amount'
  if (values.length > 0) return 'label'
  return 'unknown'
}

function detectPurpose(headers: string[]): SheetPurpose {
  const joined = headers.join(' ').toLowerCase()
  if (/budget|expense|income|spending|savings|variance|actual|planned/.test(joined)) return 'budget'
  if (/invoice|bill|client|subtotal|tax/.test(joined)) return 'invoice'
  if (/inventory|stock|sku|warehouse|quantity|reorder/.test(joined)) return 'inventory'
  if (/sales|revenue|product|profit|pipeline|deal/.test(joined)) return 'sales'
  return 'generic'
}

export function buildSheetProfile(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): SheetProfile {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }

  if (Object.keys(sheet.cells).length === 0) {
    return {
      name: sheet.name,
      rowCount: 0,
      colCount: 0,
      columns: [],
      detectedPurpose: 'generic',
      hasHeaders: false,
      hasTotalsRow: false,
    }
  }

  const headerRow = 0
  const headers: string[] = []
  for (let c = 0; c <= maxCol; c++) {
    const cell = sheet.cells[refToCell(headerRow, c)]
    const computed = getComputedValue(headerRow, c)
    const fallback = `Column ${refToCell(0, c).replace(/\d+/, '')}`
    const header = String(cell?.value ?? computed ?? fallback).trim() || fallback
    headers.push(header)
  }

  const columns: ColumnProfile[] = []
  for (let c = 0; c <= maxCol; c++) {
    const values: (string | number | null)[] = []
    const numericValues: number[] = []
    let nullCount = 0
    const uniques = new Set<string>()

    for (let r = headerRow + 1; r <= maxRow; r++) {
      const cellId = refToCell(r, c)
      const cell = sheet.cells[cellId]
      const computed = getComputedValue(r, c)
      const raw = cell?.formula ?? cell?.value ?? (computed || null)
      if (raw === null || raw === '') {
        nullCount++
        continue
      }
      values.push(raw)
      uniques.add(String(raw))
      const num = parseNumeric(raw)
      if (num !== null) numericValues.push(num)
    }

    const header = headers[c] ?? `Column ${c + 1}`
    const colLetter = refToCell(0, c).replace(/\d+/, '')
    const profile: ColumnProfile = {
      name: header,
      column: colLetter,
      dtype: numericValues.length > values.length * 0.5 ? 'number' : 'text',
      role: inferRole(header, values),
      nonNullCount: values.length,
      nullCount,
      uniqueCount: uniques.size,
      sampleValues: values.slice(0, 5).map((v) => (typeof v === 'number' ? v : String(v))),
    }

    if (numericValues.length > 0) {
      const sum = numericValues.reduce((a, b) => a + b, 0)
      profile.sumVal = sum
      profile.minVal = Math.min(...numericValues)
      profile.maxVal = Math.max(...numericValues)
      profile.meanVal = sum / numericValues.length
      profile.medianVal = [...numericValues].sort((a, b) => a - b)[Math.floor(numericValues.length / 2)]
    }

    columns.push(profile)
  }

  let hasTotalsRow = false
  if (maxRow > 0) {
    for (let c = 0; c <= maxCol; c++) {
      const val = sheet.cells[refToCell(maxRow, c)]?.value
      if (typeof val === 'string' && /total/i.test(val)) {
        hasTotalsRow = true
        break
      }
    }
  }

  return {
    name: sheet.name,
    rowCount: maxRow + 1,
    colCount: maxCol + 1,
    columns,
    detectedPurpose: detectPurpose(headers),
    hasHeaders: true,
    hasTotalsRow,
  }
}

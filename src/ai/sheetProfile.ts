import type { SheetData } from '@/types'
import { cellToRef, colToLetter, refToCell } from '@/engine/spreadsheet'
import { cellScalar } from '@/lib/formatUtils'
import type { ColumnProfile, ColumnRole, SheetProfile, SheetPurpose } from '@/ai/types'
import { findSummaryRowIndexes } from '@/lib/sheetRows'
import { parseNumeric } from '@/ai/utils'

// Header vocabularies, matched on whole words. Substring matching made "Paid"
// an id ("pa-id") and "Total Hours" money ("total").
const DATE_WORD_RE = /\b(date|timestamp)\b/
const DATE_PART_RE = /\b(month|year|due|week|period)\b/
const CATEGORY_RE = /\b(category|item|description|name|vendor|merchant|product|employee|customer|client|project|department)\b/
const ID_RE = /\b(ids?|sku|upc|ean|isbn|barcode|serial|code|zip|postcode|postal|phone|badge|bin|lot|batch|ticket|ref|po)\b|#(?!\s*of\b)|\bno\.?$|\bnumber\b(?!\s+of\b)/
const PERCENT_RE = /%|\bpercent(age)?\b|\bpct\b/
const MONEY_RATE_RE = /\b(hourly|pay|bill|billing|day|daily)\s+rate\b|\bwage\b/
// Strong money words: a measure word next to them does not override ("Price per Unit").
const MONEY_RE = /[$€£¥]|\b(amounts?|amt|costs?|prices?|spent|paid|payments?|fees?|salary|salaries|wages|revenue|income|expenses?|tax|subtotal|profit|earnings|debit|credit|refunds?|balance)\b/
// Measures: plain numbers that are not money ("Total Hours", "Qty On Hand", "Reorder Point").
const MEASURE_RE = /\b(qty|quantity|units?|count|pcs|pieces|hours?|hrs|minutes?|mins|seconds|days|weeks|overtime|on hand|stock|reorder|score|points?|rating|weight|kg|lbs?|miles|km|age|level|rank|zone|aisle|shelf|floor|seats?)\b/
// Weak money words: money only when no measure word is present ("Budget Hours" is not money).
const WEAK_MONEY_RE = /\b(total|totals|actual|budget|budgeted|planned|spend|spending|variance)\b/

/** Integers that are all distinct and large, or written with leading zeros: identifiers, not quantities. */
function looksLikeIds(values: (string | number | null)[], numbers: number[]): boolean {
  if (values.some((v) => typeof v === 'string' && /^0\d/.test(v.trim()))) return true
  if (numbers.length < 3 || !numbers.every(Number.isInteger)) return false
  return new Set(numbers).size === numbers.length && Math.min(...numbers) >= 1000
}

/**
 * Classify a column from its header and values.
 *
 * `amount` means money and is shown with a currency symbol everywhere (chat
 * answers, insight cards, the makeover's number formats, and the model's
 * prompt). So a column is money only on evidence: a money word in the header,
 * currency formatting on its cells, or currency symbols in the values. A plain
 * number column is `quantity`, or `id` when it looks like identifiers. It used
 * to be `amount` by default, which turned employee IDs, bins, hours and
 * scores into dollars.
 */
export function inferRole(
  header: string,
  values: (string | number | null)[],
  currencyFormatted = false,
): ColumnRole {
  const h = header.toLowerCase().trim()
  const numbers: number[] = []
  for (const v of values) {
    const n = parseNumeric(v)
    if (n !== null) numbers.push(n)
  }
  // An empty column is classified by its header alone.
  const isNumeric = values.length === 0 || numbers.length > values.length * 0.7

  if (DATE_WORD_RE.test(h)) return 'date'
  if (!isNumeric) {
    if (CATEGORY_RE.test(h)) return 'category'
    if (DATE_PART_RE.test(h)) return 'date'
    if (ID_RE.test(h)) return 'id'
    return 'label'
  }

  if (PERCENT_RE.test(h)) return 'percentage'
  if (MONEY_RATE_RE.test(h)) return 'amount'
  if (/\brate\b/.test(h)) return 'percentage'
  if (ID_RE.test(h)) return 'id'
  if (MONEY_RE.test(h)) return 'amount'
  if (MEASURE_RE.test(h)) return 'quantity'
  if (WEAK_MONEY_RE.test(h)) return 'amount'
  if (DATE_PART_RE.test(h)) return 'date'
  if (values.length === 0) return 'unknown'

  const symbols = values.some((v) => typeof v === 'string' && /[$€£¥]/.test(v))
  if (currencyFormatted || symbols) return 'amount'
  if (looksLikeIds(values, numbers)) return 'id'
  return 'quantity'
}

/**
 * Guess what the sheet is for from its headers. Words must start at a word
 * boundary (plurals still match): bare substrings read "factual" as budget,
 * "syntax" as an invoice, "ideal" as sales and "billable hours" as an invoice.
 */
export function detectPurpose(headers: string[]): SheetPurpose {
  const joined = headers.join(' ').toLowerCase()
  if (/\b(budget|expense|income|spending|savings|variance|actual|planned)/.test(joined)) return 'budget'
  if (/\b(invoice|bill\b|bills\b|billing|client|subtotal|tax)/.test(joined)) return 'invoice'
  if (/\b(inventory|stock|sku|warehouse|quantity|reorder)/.test(joined)) return 'inventory'
  if (/\b(sales|revenue|product|profit|pipeline|deal)/.test(joined)) return 'sales'
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

  const summaryRows = findSummaryRowIndexes(sheet, getComputedValue)
  const columns: ColumnProfile[] = []
  for (let c = 0; c <= maxCol; c++) {
    const values: (string | number | null)[] = []
    const numericValues: number[] = []
    let nullCount = 0
    let currencyCells = 0
    const uniques = new Set<string>()

    for (let r = headerRow + 1; r <= maxRow; r++) {
      if (summaryRows.has(r)) continue
      const cellId = refToCell(r, c)
      const cell = sheet.cells[cellId]
      const computed = getComputedValue(r, c)
      // Profiles describe displayed data, not formula source text. A formula
      // such as =SUM(...) must still classify its column as numeric.
      const raw = cell?.formula
        ? (computed !== '' ? computed : (cell.value ?? null))
        : (cell?.value ?? (computed || null))
      if (raw === null || raw === '') {
        nullCount++
        continue
      }
      values.push(cellScalar(raw))
      if (/^(currency|accounting)/.test(cell?.format?.numberFormat ?? '')) currencyCells++
      uniques.add(String(raw))
      const num = parseNumeric(raw)
      if (num !== null) numericValues.push(num)
    }

    const header = headers[c] ?? `Column ${colToLetter(c)}`
    const colLetter = refToCell(0, c).replace(/\d+/, '')
    const profile: ColumnProfile = {
      name: header,
      column: colLetter,
      dtype: numericValues.length > values.length * 0.5 ? 'number' : 'text',
      role: inferRole(header, values, currencyCells > values.length / 2),
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

  const hasTotalsRow = summaryRows.size > 0

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

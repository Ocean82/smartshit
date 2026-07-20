/**
 * Formula Explainer — Translates spreadsheet formulas into plain English.
 * Pattern-based, no LLM needed. Covers the most common Excel/Sheets functions.
 */

interface ExplanationResult {
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}

const RANGE_RE = /([A-Z]+\d+):([A-Z]+\d+)/g
const CELL_RE = /([A-Z]+)(\d+)/g

function describeRange(range: string, headers?: string[]): string {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
  if (!match) return range

  const [, startCol, startRow, endCol, endRow] = match
  if (startCol === endCol) {
    const colIdx = startCol.charCodeAt(0) - 65
    const headerName = headers?.[colIdx]
    const colLabel = headerName ? `"${headerName}"` : `column ${startCol}`
    return `${colLabel} from row ${startRow} to ${endRow}`
  }
  if (startRow === endRow) {
    return `row ${startRow} from column ${startCol} to ${endCol}`
  }
  return `${startCol}${startRow} to ${endCol}${endRow}`
}

function describeCell(cell: string, headers?: string[]): string {
  const match = cell.match(/^([A-Z]+)(\d+)$/)
  if (!match) return cell
  const colIdx = match[1].charCodeAt(0) - 65
  const headerName = headers?.[colIdx]
  if (headerName) return `${cell} ("${headerName}" row ${match[2]})`
  return cell
}

type PatternHandler = (formula: string, headers?: string[]) => ExplanationResult | null

const patterns: PatternHandler[] = [
  // SUM
  (formula, headers) => {
    const match = formula.match(/^SUM\((.+)\)$/i)
    if (!match) return null
    const arg = match[1]
    const rangeMatch = arg.match(/^([A-Z]+\d+):([A-Z]+\d+)$/)
    if (rangeMatch) {
      return { explanation: `Adds up all values in ${describeRange(arg, headers)}`, confidence: 'high' }
    }
    return { explanation: `Adds up: ${arg}`, confidence: 'high' }
  },

  // AVERAGE
  (formula, headers) => {
    const match = formula.match(/^AVERAGE\((.+)\)$/i)
    if (!match) return null
    const arg = match[1]
    return { explanation: `Calculates the average of ${describeRange(arg, headers)}`, confidence: 'high' }
  },

  // COUNT / COUNTA
  (formula, headers) => {
    const match = formula.match(/^COUNT[A]?\((.+)\)$/i)
    if (!match) return null
    const arg = match[1]
    const isCountA = formula.toUpperCase().startsWith('COUNTA')
    return {
      explanation: isCountA
        ? `Counts non-empty cells in ${describeRange(arg, headers)}`
        : `Counts numeric values in ${describeRange(arg, headers)}`,
      confidence: 'high',
    }
  },

  // MAX
  (formula, headers) => {
    const match = formula.match(/^MAX\((.+)\)$/i)
    if (!match) return null
    return { explanation: `Finds the largest value in ${describeRange(match[1], headers)}`, confidence: 'high' }
  },

  // MIN
  (formula, headers) => {
    const match = formula.match(/^MIN\((.+)\)$/i)
    if (!match) return null
    return { explanation: `Finds the smallest value in ${describeRange(match[1], headers)}`, confidence: 'high' }
  },

  // IF
  (formula, headers) => {
    const match = formula.match(/^IF\((.+?)\s*([><=!]+)\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\)$/i)
    if (!match) {
      const simpleIf = formula.match(/^IF\(/i)
      if (simpleIf) return { explanation: `Conditional: checks a condition and returns one of two values`, confidence: 'medium' }
      return null
    }
    const [, left, op, right, trueVal, falseVal] = match
    const opText = op === '>' ? 'is greater than' : op === '<' ? 'is less than'
      : op === '>=' ? 'is at least' : op === '<=' ? 'is at most'
        : op === '=' || op === '==' ? 'equals' : op === '<>' || op === '!=' ? 'does not equal' : op
    return {
      explanation: `If ${describeCell(left, headers)} ${opText} ${right}, shows "${trueVal}", otherwise "${falseVal}"`,
      confidence: 'high',
    }
  },

  // SUMIF
  (formula, headers) => {
    const match = formula.match(/^SUMIF\((.+?),\s*(.+?)(?:,\s*(.+?))?\)$/i)
    if (!match) return null
    const [, range, criteria, sumRange] = match
    const target = sumRange ? describeRange(sumRange, headers) : describeRange(range, headers)
    return {
      explanation: `Sums values in ${target} where ${describeRange(range, headers)} matches "${criteria}"`,
      confidence: 'high',
    }
  },

  // VLOOKUP
  (formula, headers) => {
    const match = formula.match(/^VLOOKUP\((.+?),\s*(.+?),\s*(\d+)/i)
    if (!match) return null
    const [, lookup, table, colNum] = match
    return {
      explanation: `Looks up ${describeCell(lookup, headers)} in ${describeRange(table, headers)} and returns the value from column ${colNum}`,
      confidence: 'high',
    }
  },

  // IFERROR
  (formula, headers) => {
    const match = formula.match(/^IFERROR\((.+?),\s*(.+?)\)$/i)
    if (!match) return null
    return {
      explanation: `Tries to calculate "${match[1]}" — if it errors, shows "${match[2]}" instead`,
      confidence: 'high',
    }
  },

  // ROUND
  (formula, headers) => {
    const match = formula.match(/^ROUND\((.+?),\s*(\d+)\)$/i)
    if (!match) return null
    return { explanation: `Rounds ${match[1]} to ${match[2]} decimal places`, confidence: 'high' }
  },

  // ABS
  (formula) => {
    const match = formula.match(/^ABS\((.+?)\)$/i)
    if (!match) return null
    return { explanation: `Absolute value of ${match[1]} (removes the negative sign)`, confidence: 'high' }
  },

  // CONCATENATE / concat with &
  (formula) => {
    if (formula.includes('&') || formula.match(/^CONCATENATE\(/i)) {
      return { explanation: `Combines text values together into one string`, confidence: 'medium' }
    }
    return null
  },

  // Simple arithmetic: A1+B1, A1*B1, etc.
  (formula, headers) => {
    const arith = formula.match(/^([A-Z]+\d+)\s*([+\-*/])\s*([A-Z]+\d+)$/)
    if (!arith) return null
    const [, left, op, right] = arith
    const opText = op === '+' ? 'plus' : op === '-' ? 'minus' : op === '*' ? 'multiplied by' : 'divided by'
    return {
      explanation: `${describeCell(left, headers)} ${opText} ${describeCell(right, headers)}`,
      confidence: 'high',
    }
  },

  // Cell * number or number * cell
  (formula, headers) => {
    const match = formula.match(/^([A-Z]+\d+)\s*\*\s*([\d.]+)$/) ?? formula.match(/^([\d.]+)\s*\*\s*([A-Z]+\d+)$/)
    if (!match) return null
    const [, a, b] = match
    const cell = a.match(/[A-Z]/) ? a : b
    const num = a.match(/[A-Z]/) ? b : a
    const pct = parseFloat(num)
    if (pct > 0 && pct < 1) {
      return { explanation: `${Math.round(pct * 100)}% of ${describeCell(cell, headers)}`, confidence: 'high' }
    }
    return { explanation: `${describeCell(cell, headers)} × ${num}`, confidence: 'high' }
  },
]

/**
 * Explain a formula in plain English.
 * @param formula - The formula string (without leading =)
 * @param headers - Optional array of column header names for context
 */
export function explainFormula(formula: string, headers?: string[]): ExplanationResult {
  if (!formula) return { explanation: 'Empty cell', confidence: 'high' }

  // Remove leading = if present
  const clean = formula.startsWith('=') ? formula.slice(1) : formula

  for (const handler of patterns) {
    const result = handler(clean, headers)
    if (result) return result
  }

  // Fallback: describe what functions are used
  const funcs = clean.match(/[A-Z_]+(?=\()/g)
  if (funcs && funcs.length > 0) {
    const unique = [...new Set(funcs)]
    return {
      explanation: `Uses ${unique.join(', ')} function${unique.length > 1 ? 's' : ''} — ask the AI for a detailed explanation`,
      confidence: 'low',
    }
  }

  return { explanation: 'Custom formula — ask the AI to explain this one', confidence: 'low' }
}

/**
 * Get a data type description for a non-formula cell.
 */
export function describeCellValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Empty cell'
  if (typeof value === 'boolean') return `Boolean: ${value}`
  if (typeof value === 'number') return `Number: ${value.toLocaleString()}`
  const str = String(value)
  if (str.startsWith('#')) return `Error: ${str}`
  if (str.match(/^\d{4}-\d{2}-\d{2}/) || str.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)) return `Date: ${str}`
  if (str.match(/^\$?[\d,.]+%?$/)) return `Numeric text: ${str}`
  return `Text: "${str.length > 50 ? str.slice(0, 50) + '…' : str}"`
}

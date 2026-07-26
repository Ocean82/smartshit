/**
 * Deterministic parsers for common spreadsheet formulas.
 *
 * These patterns intentionally require an explicit destination cell and all
 * formula operands. Guessing a range or destination can overwrite user data;
 * requests without enough information should fall through to clarification or
 * the LLM instead.
 */

export interface ParsedFormulaRequest {
  cell: string
  formula: string
  description: string
  explanation: string
}

const CELL_REF = '[A-Za-z]{1,3}\\d{1,7}'
const RANGE_REF = "(?:(?:'[^']+'|[A-Za-z_][A-Za-z0-9_.]*)!)?[A-Za-z]{1,3}(?:\\d{1,7})?:[A-Za-z]{1,3}(?:\\d{1,7})?"

function unquote(value: string): string {
  const trimmed = value.trim().replace(/[?.]+$/, '').trim()
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Excel/HyperFormula string literal with embedded quotes escaped. */
function quoteFormulaText(value: string): string {
  return `"${unquote(value).replace(/"/g, '""')}"`
}

function normalizeRange(value: string): string {
  return value.trim().replace(/\s*!\s*/g, '!')
}

function formulaValue(value: string): string {
  const normalized = unquote(value)
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return normalized
  if (/^(?:true|false)$/i.test(normalized)) return normalized.toUpperCase()
  if (new RegExp(`^${CELL_REF}$`, 'i').test(normalized)) return normalized.toUpperCase()
  return quoteFormulaText(normalized)
}

function normalizeComparison(operator: string): string {
  const normalized = operator.trim().toLowerCase()
  const operators: Record<string, string> = {
    '=': '=',
    '==': '=',
    'is': '=',
    'equals': '=',
    'equal to': '=',
    '>': '>',
    'over': '>',
    'above': '>',
    'greater than': '>',
    'more than': '>',
    '<': '<',
    'under': '<',
    'below': '<',
    'less than': '<',
    '>=': '>=',
    'at least': '>=',
    '<=': '<=',
    'at most': '<=',
    '!=': '<>',
    '<>': '<>',
    'is not': '<>',
    'not equal to': '<>',
  }
  return operators[normalized] ?? '='
}

function criteriaLiteral(operator: string, value: string): string {
  const op = normalizeComparison(operator)
  const normalized = unquote(value)
  return quoteFormulaText(`${op === '=' ? '' : op}${normalized}`)
}

/** Parse IF, COUNTIF, SUMIF and VLOOKUP requests with explicit operands. */
export function parseAdvancedFormula(message: string): ParsedFormulaRequest | null {
  // "Add a COUNT formula in D2 for C2:C20"
  const aggregate = message.match(new RegExp(
    `\\b(?:add|create|insert|write|put)\\s+(?:a\\s+)?(SUM|AVERAGE|COUNT|COUNTA|MAX|MIN)(?:\\s+formula)?\\s+(?:in|at|into)\\s+(${CELL_REF})\\s+(?:for|over|using)\\s+(${RANGE_REF})\\s*$`,
    'i',
  ))
  if (aggregate) {
    const fn = aggregate[1].toUpperCase()
    const cell = aggregate[2].toUpperCase()
    const formula = `=${fn}(${normalizeRange(aggregate[3])})`
    return {
      cell,
      formula,
      description: `Add ${fn} formula to ${cell}`,
      explanation: `Adding ${formula} in ${cell}.`,
    }
  }

  // "Add a COUNTIF formula in D2 to count C2:C20 equal to Overdue"
  const countIf = message.match(new RegExp(
    `\\b(?:add|create|insert|write|put)\\s+(?:a\\s+)?COUNTIF(?:\\s+formula)?\\s+(?:in|at|into)\\s+(${CELL_REF})\\s+(?:to\\s+)?count\\s+(?:cells?\\s+)?(?:in\\s+)?(${RANGE_REF})\\s+(?:that\\s+are\\s+)?(equals?(?:\\s+to)?|is|=|>=|<=|>|<|over|above|under|below|at\\s+least|at\\s+most)\\s+(.+?)\\s*$`,
    'i',
  ))
  if (countIf) {
    const cell = countIf[1].toUpperCase()
    const range = normalizeRange(countIf[2])
    const formula = `=COUNTIF(${range},${criteriaLiteral(countIf[3], countIf[4])})`
    return {
      cell,
      formula,
      description: `Add COUNTIF formula to ${cell}`,
      explanation: `Adding ${formula} in ${cell}.`,
    }
  }

  // "Add a SUMIF formula in D2 to sum B2:B20 where C2:C20 equals Paid"
  const sumIf = message.match(new RegExp(
    `\\b(?:add|create|insert|write|put)\\s+(?:a\\s+)?SUMIF(?:\\s+formula)?\\s+(?:in|at|into)\\s+(${CELL_REF})\\s+(?:to\\s+)?sum\\s+(${RANGE_REF})\\s+where\\s+(${RANGE_REF})\\s+(equals?(?:\\s+to)?|is|=|>=|<=|>|<|over|above|under|below|at\\s+least|at\\s+most)\\s+(.+?)\\s*$`,
    'i',
  ))
  if (sumIf) {
    const cell = sumIf[1].toUpperCase()
    const sumRange = normalizeRange(sumIf[2])
    const criteriaRange = normalizeRange(sumIf[3])
    const formula = `=SUMIF(${criteriaRange},${criteriaLiteral(sumIf[4], sumIf[5])},${sumRange})`
    return {
      cell,
      formula,
      description: `Add SUMIF formula to ${cell}`,
      explanation: `Adding ${formula} in ${cell}.`,
    }
  }

  // "Add an IF formula in D2: if C2 is Overdue then Late otherwise OK"
  const ifFormula = message.match(new RegExp(
    `\\b(?:add|create|insert|write|put)\\s+(?:an?|a)?\\s+IF(?:\\s+formula)?\\s+(?:in|at|into)\\s+(${CELL_REF})\\s*:?\\s*if\\s+(${CELL_REF})\\s+(equals?(?:\\s+to)?|is(?:\\s+not)?|not\\s+equal\\s+to|==|=|!=|<>|>=|<=|>|<|over|above|under|below|at\\s+least|at\\s+most|greater\\s+than|less\\s+than)\\s+(.+?)\\s+then\\s+(.+?)\\s+(?:else|otherwise)\\s+(.+?)\\s*$`,
    'i',
  ))
  if (ifFormula) {
    const cell = ifFormula[1].toUpperCase()
    const left = ifFormula[2].toUpperCase()
    const op = normalizeComparison(ifFormula[3])
    const right = formulaValue(ifFormula[4])
    const whenTrue = formulaValue(ifFormula[5])
    const whenFalse = formulaValue(ifFormula[6])
    const formula = `=IF(${left}${op}${right},${whenTrue},${whenFalse})`
    return {
      cell,
      formula,
      description: `Add IF formula to ${cell}`,
      explanation: `Adding ${formula} in ${cell}.`,
    }
  }

  // "Add a VLOOKUP formula in D2 to look up A2 in Sheet2!A2:C100 return column 3"
  const vlookup = message.match(new RegExp(
    `\\b(?:add|create|insert|write|put)\\s+(?:a\\s+)?VLOOKUP(?:\\s+formula)?\\s+(?:in|at|into)\\s+(${CELL_REF})\\s+(?:to\\s+)?look\\s*up\\s+(.+?)\\s+in\\s+(${RANGE_REF})\\s+(?:and\\s+)?return\\s+(?:value\\s+from\\s+)?column\\s+(\\d+)\\s*(exact(?:\\s+match)?|approx(?:imate)?(?:\\s+match)?)?\\s*$`,
    'i',
  ))
  if (vlookup) {
    const cell = vlookup[1].toUpperCase()
    const lookup = formulaValue(vlookup[2])
    const range = normalizeRange(vlookup[3])
    const columnIndex = Number(vlookup[4])
    if (!Number.isInteger(columnIndex) || columnIndex < 1) return null
    // Exact match is the safe default. Approximate lookup only happens when the
    // user explicitly asks for it because it requires sorted lookup data.
    const exact = !/^approx/i.test(vlookup[5] ?? '')
    const formula = `=VLOOKUP(${lookup},${range},${columnIndex},${exact ? 'FALSE' : 'TRUE'})`
    return {
      cell,
      formula,
      description: `Add VLOOKUP formula to ${cell}`,
      explanation: `Adding ${formula} in ${cell}.`,
    }
  }

  return null
}

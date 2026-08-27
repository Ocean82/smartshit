/**
 * Pattern-based intent parser — extracts tool calls from natural language.
 * No LLM needed. Handles 80%+ of common spreadsheet operations instantly.
 */

import { FONT_COLOR_HEX, HIGHLIGHT_BG_HEX } from '../../shared/colorMaps'
import type { ColumnProfile } from '@/ai/types'
import { parseAdvancedFormula } from './formulaPatterns'
import { escapeRegex, letterToCol } from '@/lib'

export interface ParsedToolCall {
  tool: string
  params: Record<string, unknown>
  description: string
}

export interface ParseResult {
  calls: ParsedToolCall[]
  understood: boolean
  explanation?: string  // Friendly message to show the user
}

const COLOR_WORD_RE = /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/

/** Sort-direction words that must never be mistaken for a column reference. */
const DIRECTION_WORDS = new Set([
  'asc', 'ascending', 'desc', 'descending', 'highest', 'lowest', 'a-z', 'z-a', 'up', 'down',
])

/**
 * Phrases that follow "delete"/"remove" but refer to an operation rather than
 * to row content. Without this guard "remove formatting" deletes a data row.
 */
const NON_ROW_DELETE_TARGETS = [
  'format', 'formatting', 'duplicate', 'duplicates', 'blank', 'empty',
  'column', 'columns', 'sheet', 'tab', 'chart', 'filter', 'filters',
  'note', 'notes', 'comment', 'comments', 'validation', 'everything', 'all',
  'border', 'borders', 'background', 'color', 'colors', 'style', 'styles',
  'highlight', 'highlights', 'conditional', 'rule', 'rules',
]

/**
 * Patterns that indicate a question/hypothetical rather than a command.
 * When detected, mutations should not fire — let the LLM handle the response.
 */
const QUESTION_PREFIXES_RE = /^(?:can\s+i|should\s+i|would\s+it|how\s+(?:do|can)\s+i|is\s+(?:it|there)|what\s+(?:if|happens))\b/i

/**
 * Pronouns and vague references that should never be used as row match targets.
 * "delete that one" or "remove it" are too ambiguous for immediate mutation.
 */
const VAGUE_MATCH_RE = /^(?:that\s+one|this\s+one|it|that|this|them|those|these|one)$/i

const NON_ROW_DELETE_RE = NON_ROW_DELETE_TARGETS.map(
  (word) => new RegExp(`\\b${word}\\b`),
)

function isNonRowDeleteTarget(text: string): boolean {
  const t = text.toLowerCase()
  return NON_ROW_DELETE_RE.some((re) => re.test(t))
}


function columnMentioned(message: string, column: ColumnProfile): boolean {
  const lower = message.toLowerCase()
  const header = column.name.trim().toLowerCase()
  if (header && new RegExp(`\\b${escapeRegex(header)}\\b`, 'i').test(lower)) return true
  return new RegExp(`\\bcolumn\\s+${escapeRegex(column.column)}\\b`, 'i').test(message)
}

/**
 * Resolve a natural-language column without silently picking an arbitrary
 * spreadsheet position. Detected amount roles are preferred for financial
 * superlatives; a sole numeric column is a safe final fallback.
 */
function resolveSmartColumn(
  message: string,
  sheetContext?: SheetContext,
  options?: { preferAmount?: boolean; allowNumericFallback?: boolean },
): string | undefined {
  const columns = sheetContext?.columns ?? []
  const mentioned = columns.filter((column) => columnMentioned(message, column))
  if (mentioned.length === 1) return mentioned[0].column

  const explicitColumn = message.match(/\bcolumn\s+([a-z]{1,3})\b/i)?.[1]
  if (explicitColumn && !DIRECTION_WORDS.has(explicitColumn.toLowerCase())) {
    return explicitColumn.toUpperCase()
  }

  const bareColumn = message.match(/\b(?:in|from|of)\s+([a-z]{1,3})\s*[?.!]*$/i)?.[1]
  if (bareColumn && !DIRECTION_WORDS.has(bareColumn.toLowerCase())) {
    const index = letterToCol(bareColumn)
    if (!sheetContext || index <= sheetContext.lastDataCol) return bareColumn.toUpperCase()
  }

  if (options?.preferAmount) {
    const amountColumns = columns.filter((column) => column.role === 'amount' && column.nonNullCount > 0)
    if (amountColumns.length === 1) return amountColumns[0].column

    // If several columns have amount-like roles (for example Budget + Actual),
    // only choose when the wording clearly singles one out.
    if (amountColumns.length > 1) {
      const lower = message.toLowerCase()
      const scored = amountColumns.map((column) => {
        const header = column.name.toLowerCase()
        let score = 0
        if (/expense|expensive/.test(lower) && /expense|amount|cost|price|spent/.test(header)) score += 3
        if (/actual/.test(lower) && /actual/.test(header)) score += 4
        if (/budget|planned/.test(lower) && /budget|plan/.test(header)) score += 4
        if (/revenue|income/.test(lower) && /revenue|income/.test(header)) score += 4
        if (/amount/.test(header)) score += 1
        return { column, score }
      }).sort((a, b) => b.score - a.score)
      if (scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -1)) {
        return scored[0].column.column
      }
    }
  }

  const numericColumns = columns.filter((column) => column.dtype === 'number' && column.nonNullCount > 0)
  if (options?.allowNumericFallback !== false && numericColumns.length === 1) return numericColumns[0].column
  return undefined
}

function describeColumnChoices(sheetContext?: SheetContext): string {
  const columns = (sheetContext?.columns ?? [])
    .filter((column) => column.nonNullCount > 0)
    .slice(0, 5)
    .map((column) => `${column.name} (${column.column})`)
  if (columns.length === 0) return ''
  return ` Available columns: ${columns.join(', ')}.`
}

/**
 * Parse a user message into zero or more tool calls.
 * Returns { understood: false } if no patterns match (should fallback to LLM).
 */
export function parseMessage(message: string, sheetContext?: SheetContext): ParseResult {
  const lower = message.toLowerCase().trim()
  const calls: ParsedToolCall[] = []

  // ─── Question / hypothetical guard ──────────────────────────────────────────
  // Sentences framed as questions should never produce immediate mutations.
  // Let the LLM handle clarification and explanation.
  if (QUESTION_PREFIXES_RE.test(lower)) {
    return { calls: [], understood: false }
  }

  // ─── Multi-step compound requests ───────────────────────────────────────────
  // "clear and build a budget" → clear_sheet + create_budget_template
  if ((lower.includes('clear') || lower.includes('reset') || lower.includes('start over')) && 
      (lower.includes('build') || lower.includes('create') || lower.includes('make') || lower.includes('new budget'))) {
    calls.push({ tool: 'clear_sheet', params: {}, description: 'Clear current sheet' })
    if (lower.includes('budget') || lower.includes('expense')) {
      calls.push({ tool: 'create_budget_template', params: {}, description: 'Create monthly budget template' })
    } else if (lower.includes('sales') || lower.includes('revenue')) {
      calls.push({ tool: 'create_sales_tracker', params: {}, description: 'Create sales tracker' })
    } else if (lower.includes('invoice')) {
      calls.push({ tool: 'create_invoice', params: {}, description: 'Create invoice template' })
    }
    if (calls.length > 1) {
      return { calls, understood: true, explanation: 'I\'ll clear the sheet and build a fresh template for you.' }
    }
  }

  // ─── Advanced formulas (explicit destination + operands required) ───────────
  // This must run before the generic "put X in Y" matcher, which would
  // otherwise write the words "a COUNTIF formula" into the destination cell.
  const advancedFormula = parseAdvancedFormula(message)
  if (advancedFormula) {
    calls.push({
      tool: 'apply_formula',
      params: { cell: advancedFormula.cell, formula: advancedFormula.formula },
      description: advancedFormula.description,
    })
    return { calls, understood: true, explanation: advancedFormula.explanation }
  }

  // ─── Set cell: "put X in Y" / "set Y to X" ─────────────────────────────────
  const putIn = lower.match(/(?:put|set|write|enter)\s+(.+?)\s+(?:in|into|to|at)\s+([a-z]\d{1,3})/i)
  if (putIn) {
    const value = putIn[1].replace(/^["']|["']$/g, '').trim()
    const cell = putIn[2].toUpperCase()
    const numVal = parseFloat(value.replace(/[$,]/g, ''))
    const finalVal = !isNaN(numVal) && !/[a-z]/i.test(value.replace(/[$,.\d\s]/g, '')) ? String(numVal) : value
    calls.push({ tool: 'set_cell', params: { cell, value: finalVal }, description: `Set ${cell} to ${value}` })
    return { calls, understood: true, explanation: `Setting ${cell} to "${value}".` }
  }

  // "set A1 to 500" / "change B2 to hello" — cell first, value second.
  // (The `putIn` pattern above only covers "put <value> in <cell>".)
  const setCellTo = message.match(/(?:set|change|update)\s+(?:cell\s+)?([a-z]{1,3}\d{1,4})\s+to\s+(.+)/i)
  if (setCellTo) {
    const cell = setCellTo[1].toUpperCase()
    const value = setCellTo[2].replace(/^["']|["']$/g, '').trim()
    calls.push({ tool: 'set_cell', params: { cell, value }, description: `Set ${cell} to ${value}` })
    return { calls, understood: true, explanation: `Setting ${cell} to "${value}".` }
  }

  // "A1 = 500" or "B3 = =SUM(B1:B2)"
  const cellEquals = lower.match(/^([a-z]\d{1,3})\s*=\s*(.+)$/i)
  if (cellEquals) {
    const cell = cellEquals[1].toUpperCase()
    const value = cellEquals[2].trim()
    calls.push({ tool: 'set_cell', params: { cell, value }, description: `Set ${cell} to ${value}` })
    return { calls, understood: true, explanation: `Setting ${cell} to "${value}".` }
  }

  // ─── Export (uses the same browser exporters as File > Save as) ─────────────
  if (/\b(?:export|download|save\s+(?:this|it|the\s+(?:sheet|workbook))?\s*as|convert\s+(?:this|it|the\s+(?:sheet|workbook))?\s*to)\b/i.test(message)) {
    const format = /\bcsv\b/i.test(message) ? 'csv'
      : /\b(?:xlsx|excel)\b/i.test(message) ? 'xlsx'
      : /\bjson\b/i.test(message) ? 'json'
      : undefined
    if (!format) {
      return {
        calls: [],
        understood: true,
        explanation: 'Which format should I export: CSV, Excel (.xlsx), or JSON?',
      }
    }
    calls.push({
      tool: 'export_data',
      params: { format },
      description: `Export as ${format.toUpperCase()}`,
    })
    return { calls, understood: true, explanation: `Exporting ${format === 'xlsx' ? 'an Excel workbook' : `as ${format.toUpperCase()}`}.` }
  }

  // ─── Add row: "add [items]" ─────────────────────────────────────────────────
  const addRow = lower.match(/(?:add|insert|new)\s+(?:a\s+)?(?:row|entry|line|item)\s*:?\s*(.+)/i)
  if (addRow && !lower.includes('column')) {
    const parts = addRow[1].split(/[,;]/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      const values = parts.map(p => {
        const n = parseFloat(p.replace(/[$,]/g, ''))
        return !isNaN(n) && p.match(/^\$?[\d,.]+$/) ? n : p
      })
      calls.push({ tool: 'add_row', params: { values }, description: `Add row: ${parts.join(', ')}` })
      return { calls, understood: true, explanation: `Adding a new row with: ${parts.join(', ')}.` }
    }
  }

  // "add Groceries $400" (without "row" keyword)
  const addImplicit = lower.match(/^add\s+([a-z][\w\s]+?)[,\s]+\$?([\d,.]+)/i)
  if (addImplicit && !lower.includes('column') && !lower.includes('%')) {
    const label = addImplicit[1].trim()
    const amount = parseFloat(addImplicit[2].replace(/,/g, ''))
    calls.push({ tool: 'add_row', params: { values: [label, amount] }, description: `Add: ${label}, $${amount}` })
    return { calls, understood: true, explanation: `Adding "${label}" with amount $${amount}.` }
  }

  // ─── Delete row ─────────────────────────────────────────────────────────────
  const deleteRowNum = lower.match(/(?:delete|remove)\s+row\s+(\d+)/i)
  if (deleteRowNum) {
    const row = parseInt(deleteRowNum[1])
    calls.push({ tool: 'delete_row', params: { row }, description: `Delete row ${row}` })
    return { calls, understood: true, explanation: `Deleting row ${row}.` }
  }

  const deleteRowMatch = lower.match(/(?:delete|remove)\s+(?:the\s+)?(.+?)\s+(?:row|entry|line)\b/i)
  if (deleteRowMatch && !isNonRowDeleteTarget(deleteRowMatch[1]) && !VAGUE_MATCH_RE.test(deleteRowMatch[1].trim())) {
    const match = deleteRowMatch[1].trim()
    calls.push({ tool: 'delete_row', params: { match }, description: `Delete row containing "${match}"` })
    return { calls, understood: true, explanation: `Removing the row containing "${match}".` }
  }

  // "remove Netflix" (without "row" keyword). Guarded so that operational
  // phrases like "remove formatting" or "remove duplicates" fall through to the
  // LLM instead of deleting an unrelated data row.
  const removeSimple = lower.match(/(?:delete|remove)\s+(?:the\s+)?([a-z][\w\s]{2,})/i)
  if (removeSimple && !isNonRowDeleteTarget(lower) && !VAGUE_MATCH_RE.test(removeSimple[1].trim())) {
    const match = removeSimple[1].trim()
    if (!['all', 'everything', 'data'].includes(match)) {
      calls.push({ tool: 'delete_row', params: { match }, description: `Delete row: ${match}` })
      return { calls, understood: true, explanation: `Removing the row containing "${match}".` }
    }
  }

  // ─── Rename header ──────────────────────────────────────────────────────────
  const renameCol = lower.match(/(?:rename|change)\s+(?:column\s+)?([a-z])\s+(?:to|header to|heading to)\s+(.+)/i)
  if (renameCol) {
    const column = renameCol[1].toUpperCase()
    const newName = renameCol[2].replace(/^["']|["']$/g, '').trim()
    calls.push({ tool: 'rename_header', params: { column, newName }, description: `Rename column ${column} to "${newName}"` })
    return { calls, understood: true, explanation: `Renaming column ${column} header to "${newName}".` }
  }

  // ─── Sort ───────────────────────────────────────────────────────────────────
  // Anchored on the whole word "sort" so "resort"/"assorted" do not trigger it.
  if (/\bsort\b/.test(lower)) {
    const dirHint = lower.match(/\b(asc|ascending|desc|descending|highest|lowest|a-z|z-a)\b/)?.[1] ?? ''
    const direction = ['desc', 'descending', 'highest', 'z-a'].includes(dirHint) ? 'desc' : 'asc'

    // Accept an explicit column letter ("sort by column B", "sort by B") or a
    // header name ("sort by amount"). Never guess a default column — a silent
    // sort on the wrong column reorders the user's data destructively.
    const explicitColumn = message.match(/\bsort\s+(?:(?:my|the|this)\s+(?:data|sheet)\s+)?(?:by\s+|on\s+)?column\s+([A-Za-z]{1,3})\b/i)?.[1]
    const shortTarget = message.match(/\bsort\s+(?:(?:my|the|this)\s+(?:data|sheet)\s+)?(?:by|on)\s+([A-Za-z]{1,3})\b(?!\w)/i)?.[1]

    // Header-name form: "sort by amount", "sort my data by amount".
    // Trailing direction/ordering words are not part of the column name.
    const rawName = message.match(/\bsort\s+(?:(?:my|the|this)\s+(?:data|sheet)\s+)?(?:by|on)\s+(?:the\s+)?["']?([\w ]+?)["']?\s*$/i)?.[1]
    const byName = rawName
      ?.replace(/\b(asc|ascending|desc|descending|highest|lowest|a-z|z-a|first|last|order|column)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    let column: string | undefined
    const matchingHeader = byName
      ? sheetContext?.headers?.find((header) => header.toLowerCase() === byName.toLowerCase())
      : undefined
    if (matchingHeader) {
      // A short header such as Tax or ID must win over interpreting TAX/ID as
      // a distant spreadsheet column reference.
      column = matchingHeader
    } else if (explicitColumn && !DIRECTION_WORDS.has(explicitColumn.toLowerCase())) {
      column = explicitColumn.toUpperCase()
    } else if (shortTarget && !DIRECTION_WORDS.has(shortTarget.toLowerCase())) {
      const index = letterToCol(shortTarget)
      column = !sheetContext || index <= sheetContext.lastDataCol
        ? shortTarget.toUpperCase()
        : byName
    } else if (byName && !DIRECTION_WORDS.has(byName.toLowerCase())) {
      column = byName
    }

    if (!column) {
      // Sorting reorders complete rows, so a guessed column is destructive.
      // Handle the ambiguity locally instead of spending an LLM round trip.
      return {
        calls: [],
        understood: true,
        explanation: dirHint
          ? `Which column should I sort by? I'll use ${direction === 'desc' ? 'descending' : 'ascending'} order.${describeColumnChoices(sheetContext)}`
          : `Which column should I sort by, and should it be ascending or descending?${describeColumnChoices(sheetContext)}`,
      }
    }

    calls.push({ tool: 'sort_sheet', params: { column, direction }, description: `Sort by column ${column} ${direction}` })
    return { calls, understood: true, explanation: `Sorting by ${column} (${direction === 'desc' ? 'highest first' : 'lowest first'}).` }
  }

  // ─── Percentage operations ──────────────────────────────────────────────────
  const pctAdd = lower.match(/(?:add|increase|raise|markup)\s+(\d+)\s*%\s*(?:to\s+)?(?:column\s+)?([a-z]{1,3})?(?=\s|$)/i)
  if (pctAdd) {
    const pct = parseInt(pctAdd[1])
    const col = resolveSmartColumn(message, sheetContext, { preferAmount: true, allowNumericFallback: false })
      ?? pctAdd[2]?.toUpperCase()
    if (!col) {
      return {
        calls: [],
        understood: true,
        explanation: `Which numeric column should I increase by ${pct}%?${describeColumnChoices(sheetContext)}`,
      }
    }
    calls.push({ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 + pct / 100 }, description: `Add ${pct}% to column ${col}` })
    return { calls, understood: true, explanation: `Increasing all values in column ${col} by ${pct}%.` }
  }

  const pctReduce = lower.match(/(?:reduce|decrease|discount|subtract)\s+(\d+)\s*%\s*(?:from\s+)?(?:column\s+)?([a-z]{1,3})?(?=\s|$)/i)
  if (pctReduce) {
    const pct = parseInt(pctReduce[1])
    const col = resolveSmartColumn(message, sheetContext, { preferAmount: true, allowNumericFallback: false })
      ?? pctReduce[2]?.toUpperCase()
    if (!col) {
      return {
        calls: [],
        understood: true,
        explanation: `Which numeric column should I decrease by ${pct}%?${describeColumnChoices(sheetContext)}`,
      }
    }
    calls.push({ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 - pct / 100 }, description: `Reduce column ${col} by ${pct}%` })
    return { calls, understood: true, explanation: `Decreasing all values in column ${col} by ${pct}%.` }
  }

  // ─── Formula: average / count (totals route through the goal matcher) ────
  const avgCol = lower.match(/\b(?:average|avg|mean)\s+(?:of\s+)?(?:column\s+)?([a-z]{1,3})\b/i)
  if (avgCol) {
    const col = resolveSmartColumn(message, sheetContext, { preferAmount: true })
      ?? avgCol[1].toUpperCase()
    calls.push({ tool: 'apply_formula', params: { cell: col, formula: '=AVERAGE' }, description: `Average column ${col}` })
    return { calls, understood: true, explanation: `Adding an AVERAGE formula for column ${col}.` }
  }

  // Explicit formula creation remains a mutation; count questions below are
  // read-only and return the answer without writing into the sheet.
  const countFormulaCol = lower.match(/\b(?:add|create|insert)\s+(?:a\s+)?counta?\s+formula\s+(?:for|to|of)\s+(?:column\s+)?([a-z]{1,3})\b/i)
  if (countFormulaCol) {
    const col = resolveSmartColumn(message, sheetContext)
      ?? countFormulaCol[1].toUpperCase()
    const fn = /\bcounta\b/i.test(lower) ? '=COUNTA' : '=COUNT'
    calls.push({ tool: 'apply_formula', params: { cell: col, formula: fn }, description: `Count column ${col}` })
    return { calls, understood: true, explanation: `Adding a ${fn.slice(1)} formula for column ${col}.` }
  }

  // ─── Read-only row counts ───────────────────────────────────────────────────
  const conditionalCount = lower.match(/^(?:how\s+many|count\s+how\s+many)\s+(?:(?:rows?|entries|items|records|cells?)\s+)?(?:are|have|contain(?:ing)?|with)\s+(.+?)\s*[?]*$/i)
    ?? lower.match(/^count\s+(?:the\s+)?(.+?)\s+(?:rows?|entries|items|records)\s*[?]*$/i)
  if (conditionalCount) {
    let criterion = conditionalCount[1].trim()
    let column = resolveSmartColumn(message, sheetContext, { allowNumericFallback: false })

    if (column) {
      const profile = sheetContext?.columns?.find((item) => item.column === column)
      if (profile) {
        criterion = criterion
          .replace(new RegExp(`^(?:an?\\s+|the\\s+)?${escapeRegex(profile.name)}\\s+(?:of|is|=|are)?\\s*`, 'i'), '')
          .replace(new RegExp(`\\s+in\\s+(?:the\\s+)?(?:${escapeRegex(profile.name)}|column\\s+${escapeRegex(profile.column)})$`, 'i'), '')
          .replace(new RegExp(`\\s+${escapeRegex(profile.name)}$`, 'i'), '')
          .replace(/^(?:an?|the)\s+/i, '')
          .trim()
      }
    }

    const numeric = criterion.match(/^(?:values?\s+)?(over|above|greater\s+than|more\s+than|under|below|less\s+than|at\s+least|at\s+most|>=|<=|>|<)\s*\$?([\d,.]+)$/i)
    let operator = 'equals'
    let value: string | number = criterion.replace(/^(?:value|status)\s+/, '').trim()
    if (numeric) {
      const operatorMap: Record<string, string> = {
        over: 'gt', above: 'gt', 'greater than': 'gt', 'more than': 'gt', '>': 'gt',
        under: 'lt', below: 'lt', 'less than': 'lt', '<': 'lt',
        'at least': 'gte', '>=': 'gte', 'at most': 'lte', '<=': 'lte',
      }
      operator = operatorMap[numeric[1].toLowerCase()] ?? 'equals'
      value = parseFloat(numeric[2].replace(/,/g, ''))
      column ??= resolveSmartColumn(message, sheetContext, { preferAmount: true })
    } else if (/\bcontain/.test(lower)) {
      operator = 'contains'
    }

    if (String(value).trim()) {
      calls.push({
        tool: 'count_rows',
        params: { column, operator, value },
        description: `Count rows matching ${value}`,
      })
      return { calls, understood: true, explanation: `Counting rows matching "${value}".` }
    }
  }

  const countColumn = lower.match(/^count\s+(?:(?:the\s+)?(?:values|entries|cells)\s+)?(?:in\s+)?(?:column\s+)?([a-z]{1,3})\s*[?.]*$/i)
  if (countColumn) {
    const column = countColumn[1].toUpperCase()
    calls.push({ tool: 'count_rows', params: { column, operator: 'not_empty' }, description: `Count entries in column ${column}` })
    return { calls, understood: true, explanation: `Counting non-empty entries in column ${column}.` }
  }

  // ─── Comparative highlighting ───────────────────────────────────────────────
  // Handles "highlight over 500" and "highlight anything above $1,000".
  // When a target is named ("expenses" / a header), constrain the range;
  // otherwise scan numeric cells in the selection or populated sheet.
  const comparativeHighlight = lower.match(/\b(highlight|colou?r|mark|shade)\s+(?:all\s+)?(.+?)?\s*(over|above|greater\s+than|more\s+than|under|below|less\s+than|at\s+least|at\s+most|>=|<=|>|<)\s*\$?([\d,.]+)\b/i)
  if (comparativeHighlight) {
    const targetText = (comparativeHighlight[2] ?? '').trim()
    const operatorMap: Record<string, 'gt' | 'lt' | 'gte' | 'lte'> = {
      over: 'gt', above: 'gt', 'greater than': 'gt', 'more than': 'gt', '>': 'gt',
      under: 'lt', below: 'lt', 'less than': 'lt', '<': 'lt',
      'at least': 'gte', '>=': 'gte', 'at most': 'lte', '<=': 'lte',
    }
    const operator = operatorMap[comparativeHighlight[3].toLowerCase()]
    const value = parseFloat(comparativeHighlight[4].replace(/,/g, ''))
    const range = /\b(?:anything|cells?|values?|numbers?)\b/.test(targetText)
      ? resolveSmartColumn(targetText, sheetContext, { allowNumericFallback: false })
      : resolveSmartColumn(targetText, sheetContext, {
        preferAmount: /expense|amount|cost|price|spend/.test(targetText),
        allowNumericFallback: false,
      })
    const colorWord = lower.slice((comparativeHighlight.index ?? 0) + comparativeHighlight[0].length).match(COLOR_WORD_RE)?.[1]
    const bgColor = (colorWord && HIGHLIGHT_BG_HEX[colorWord]) || '#FFF9C4'
    calls.push({
      tool: 'format_cells',
      params: { range, condition: { operator, value }, bgColor },
      description: `Highlight values ${comparativeHighlight[3]} ${value}`,
    })
    return { calls, understood: true, explanation: `Highlighting values ${comparativeHighlight[3]} ${value}${range ? ` in column ${range}` : ''}.` }
  }

  // ─── Find max/min ───────────────────────────────────────────────────────────
  if (/\b(?:biggest|largest|highest|maximum|max|most\s+expensive)\b/i.test(lower)) {
    const col = resolveSmartColumn(message, sheetContext, { preferAmount: true })
    if (!col) {
      return {
        calls: [],
        understood: true,
        explanation: `Which numeric column should I use to find the highest value?${describeColumnChoices(sheetContext)}`,
      }
    }
    calls.push({ tool: 'find_max', params: { column: col }, description: `Find max in column ${col}` })
    return { calls, understood: true, explanation: `Finding the highest value in column ${col}.` }
  }

  if (/\b(?:smallest|lowest|minimum|min|cheapest|least\s+expensive)\b/i.test(lower)) {
    const col = resolveSmartColumn(message, sheetContext, { preferAmount: true })
    if (!col) {
      return {
        calls: [],
        understood: true,
        explanation: `Which numeric column should I use to find the lowest value?${describeColumnChoices(sheetContext)}`,
      }
    }
    calls.push({ tool: 'find_min', params: { column: col }, description: `Find min in column ${col}` })
    return { calls, understood: true, explanation: `Finding the lowest value in column ${col}.` }
  }

  // ─── Bold/format ────────────────────────────────────────────────────────────
  if (lower.includes('bold') && lower.includes('header')) {
    const headerRowNum = (sheetContext?.headerRow ?? 0) + 1
    calls.push({ tool: 'format_cells', params: { range: `A${headerRowNum}:Z${headerRowNum}`, bold: true }, description: 'Bold headers' })
    return { calls, understood: true, explanation: 'Making the header row bold.' }
  }

  // ─── Format/color intents (must run BEFORE find/replace) ───────────────────

  // "change the text to red" / "make text blue" / "font color red" → fontColor
  const fontColorMatch =
    lower.match(/(?:change|make|set|turn|color|colour)\s+(?:all\s+)?(?:the\s+)?(?:text|font|writing)(?:\s+colou?r)?\s+(?:to\s+)?(\w+)/) ??
    lower.match(/(?:font|text)\s+colou?r\s*:?\s*(?:to\s+)?(\w+)/)
  if (fontColorMatch && FONT_COLOR_HEX[fontColorMatch[1]]) {
    const colorWord = fontColorMatch[1]
    calls.push({
      tool: 'format_cells',
      params: { fontColor: FONT_COLOR_HEX[colorWord] },
      description: `Change text color to ${colorWord}`,
    })
    return { calls, understood: true, explanation: `Changing the text color to ${colorWord}.` }
  }

  // "highlight cells containing 4" / "identify cells that contain 4 and highlight" → contains condition
  const containsMatch = lower.match(
    /cells?\s+(?:that\s+)?(?:contain(?:ing|s)?|with|having)\s+(?:the\s+)?(?:number\s+|value\s+|text\s+)?["']?([\w.$-]+)["']?/,
  )
  if (containsMatch && lower.match(/highlight|colou?r|mark|shade/)) {
    const value = containsMatch[1]
    const colorWord = lower.match(COLOR_WORD_RE)?.[1]
    const bgColor = (colorWord && colorWord !== value && HIGHLIGHT_BG_HEX[colorWord]) || '#FFF9C4'
    calls.push({
      tool: 'format_cells',
      params: { condition: { operator: 'contains', value }, bgColor },
      description: `Highlight cells containing ${value}`,
    })
    return { calls, understood: true, explanation: `Highlighting cells containing "${value}".` }
  }

  // "highlight cells equal to 4" → numeric eq condition
  const highlightEquals = lower.match(
    /(highlight|colou?r|mark|shade)\s+(?:the\s+)?cells?\s+(?:that\s+are\s+)?(?:equals?(\s+to)?|=)\s*\$?([\d,.]+)/,
  )
  if (highlightEquals) {
    const value = parseFloat(highlightEquals[3].replace(/,/g, ''))
    const colorWord = lower.slice(highlightEquals.index! + highlightEquals[0].length).match(COLOR_WORD_RE)?.[1]
    const bgColor = (colorWord && HIGHLIGHT_BG_HEX[colorWord]) || '#FFF9C4'
    calls.push({
      tool: 'format_cells',
      params: { condition: { operator: 'eq', value }, bgColor },
      description: `Highlight cells equal to ${value}`,
    })
    return { calls, understood: true, explanation: `Highlighting cells equal to ${value}.` }
  }

  // ─── Highlight negatives (requires the word "negative") ────────────────────
  if (lower.match(/highlight|colou?r|mark|shade/) && lower.includes('negative')) {
    const col = lower.match(/\bcolumn\s+([a-z]{1,3})\b/i)?.[1]?.toUpperCase()
    calls.push({
      tool: 'format_cells',
      params: { range: col, condition: { operator: 'negative' }, bgColor: '#FEE2E2' },
      description: 'Highlight negatives',
    })
    return { calls, understood: true, explanation: `Highlighting negative values${col ? ` in column ${col}` : ''} in red.` }
  }

  // ─── Rename sheet ───────────────────────────────────────────────────────────
  const renameSheet = lower.match(/(?:rename|call)\s+(?:this\s+)?(?:sheet|tab)\s+(?:to\s+)?(.+)/i)
  if (renameSheet) {
    const name = renameSheet[1].replace(/^["']|["']$/g, '').trim()
    calls.push({ tool: 'rename_sheet', params: { name }, description: `Rename sheet to "${name}"` })
    return { calls, understood: true, explanation: `Renaming this sheet to "${name}".` }
  }

  // ─── Find and replace ───────────────────────────────────────────────────────
  const findReplace = lower.match(/(?:replace|change)\s+(?:all\s+)?["']?(.+?)["']?\s+(?:with|to)\s+["']?(.+?)["']?$/i)
  if (findReplace && !lower.includes('column') && !lower.includes('header') && !lower.includes('rename')) {
    const find = findReplace[1].trim()
    const replace = findReplace[2].trim()
    // Formatting request, not find/replace: "change X to red", "change the highlight color to blue"
    const isFormattingIntent =
      COLOR_WORD_RE.test(replace) ||
      /\b(highlight|font|colou?r)\b/.test(lower)
    if (isFormattingIntent) {
      if (FONT_COLOR_HEX[replace]) {
        calls.push({
          tool: 'format_cells',
          params: { fontColor: FONT_COLOR_HEX[replace] },
          description: `Change text color to ${replace}`,
        })
        return { calls, understood: true, explanation: `Changing the text color to ${replace}.` }
      }
      return { calls: [], understood: false }
    }
    calls.push({ tool: 'find_and_replace', params: { find, replace }, description: `Replace "${find}" with "${replace}"` })
    return { calls, understood: true, explanation: `Replacing all "${find}" with "${replace}".` }
  }

  // ─── No match — not understood ──────────────────────────────────────────────
  return { calls: [], understood: false }
}

/** Minimal sheet context for parser decisions */
export interface SheetContext {
  headerRow: number
  lastDataRow: number
  lastDataCol: number
  headers: string[]
  /** Profile metadata powers safe defaults (roles, numeric columns, samples). */
  columns?: ColumnProfile[]
}

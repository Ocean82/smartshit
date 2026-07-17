/**
 * Pattern-based intent parser — extracts tool calls from natural language.
 * No LLM needed. Handles 80%+ of common spreadsheet operations instantly.
 */

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

const CELL_REF = /\b([A-Z])(\d{1,3})\b/i
const COL_REF = /\bcolumn\s+([A-Z])\b/i
const RANGE_REF = /\b([A-Z]\d{1,3}):([A-Z]\d{1,3})\b/i
const NUMBER = /\$?([\d,]+(?:\.\d+)?)/
const PERCENT = /(\d+)\s*%/

/** Vivid hexes for font colors */
const FONT_COLOR_HEX: Record<string, string> = {
  red: '#FF0000',
  blue: '#0000FF',
  green: '#008000',
  yellow: '#EAB308',
  orange: '#F97316',
  purple: '#800080',
  pink: '#EC4899',
  black: '#000000',
  white: '#FFFFFF',
  gray: '#6B7280',
  grey: '#6B7280',
}

/** Soft hexes for cell highlight backgrounds */
const HIGHLIGHT_BG_HEX: Record<string, string> = {
  red: '#FEE2E2',
  blue: '#DBEAFE',
  green: '#DCFCE7',
  yellow: '#FFF9C4',
  orange: '#FFEDD5',
  purple: '#F3E8FF',
  pink: '#FCE7F3',
  gray: '#F3F4F6',
  grey: '#F3F4F6',
}

const COLOR_WORD_RE = /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/

/**
 * Parse a user message into zero or more tool calls.
 * Returns { understood: false } if no patterns match (should fallback to LLM).
 */
export function parseMessage(message: string, sheetContext?: SheetContext): ParseResult {
  const lower = message.toLowerCase().trim()
  const calls: ParsedToolCall[] = []

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

  // "A1 = 500" or "B3 = =SUM(B1:B2)"
  const cellEquals = lower.match(/^([a-z]\d{1,3})\s*=\s*(.+)$/i)
  if (cellEquals) {
    const cell = cellEquals[1].toUpperCase()
    const value = cellEquals[2].trim()
    calls.push({ tool: 'set_cell', params: { cell, value }, description: `Set ${cell} to ${value}` })
    return { calls, understood: true, explanation: `Setting ${cell} to "${value}".` }
  }

  // ─── Add row: "add [items]" ─────────────────────────────────────────────────
  const addRow = lower.match(/(?:add|insert|new)\s+(?:a\s+)?(?:row|entry|line|item)(?:\s*:?\s*)(.+)/i)
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

  const deleteRowMatch = lower.match(/(?:delete|remove)\s+(?:the\s+)?(.+?)\s+(?:row|entry|line)/i)
  if (deleteRowMatch) {
    const match = deleteRowMatch[1].trim()
    calls.push({ tool: 'delete_row', params: { match }, description: `Delete row containing "${match}"` })
    return { calls, understood: true, explanation: `Removing the row containing "${match}".` }
  }

  // "remove Netflix" (without "row" keyword)
  const removeSimple = lower.match(/(?:delete|remove)\s+(?:the\s+)?([a-z][\w\s]{2,})/i)
  if (removeSimple && !lower.includes('column') && !lower.includes('sheet')) {
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
  const sortCol = lower.match(/sort\s+(?:by\s+)?(?:column\s+)?([a-z])?\s*(?:(asc|desc|highest|lowest|a-z|z-a)(?:ending)?)?/i)
  if (lower.includes('sort') && sortCol) {
    const column = (sortCol[1] || 'B').toUpperCase()
    const dirHint = (sortCol[2] || '').toLowerCase()
    const direction = ['desc', 'highest', 'z-a'].includes(dirHint) ? 'desc' : 'asc'
    calls.push({ tool: 'sort_sheet', params: { column, direction }, description: `Sort by column ${column} ${direction}` })
    return { calls, understood: true, explanation: `Sorting by column ${column} (${direction === 'desc' ? 'highest first' : 'lowest first'}).` }
  }

  // ─── Percentage operations ──────────────────────────────────────────────────
  const pctAdd = lower.match(/(?:add|increase|raise|markup)\s+(\d+)\s*%\s+(?:to\s+)?(?:column\s+)?([a-z])?/i)
  if (pctAdd) {
    const pct = parseInt(pctAdd[1])
    const col = (pctAdd[2] || 'B').toUpperCase()
    calls.push({ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 + pct / 100 }, description: `Add ${pct}% to column ${col}` })
    return { calls, understood: true, explanation: `Increasing all values in column ${col} by ${pct}%.` }
  }

  const pctReduce = lower.match(/(?:reduce|decrease|discount|subtract)\s+(\d+)\s*%\s+(?:from\s+)?(?:column\s+)?([a-z])?/i)
  if (pctReduce) {
    const pct = parseInt(pctReduce[1])
    const col = (pctReduce[2] || 'B').toUpperCase()
    calls.push({ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 - pct / 100 }, description: `Reduce column ${col} by ${pct}%` })
    return { calls, understood: true, explanation: `Decreasing all values in column ${col} by ${pct}%.` }
  }

  // ─── Formula: "sum/total/average column X" ──────────────────────────────────
  const formulaCol = lower.match(/(?:sum|total|add up)\s+(?:of\s+)?(?:column\s+)?([a-z])/i)
  if (formulaCol) {
    const col = formulaCol[1].toUpperCase()
    calls.push({ tool: 'apply_formula', params: { cell: col, formula: '=SUM' }, description: `Sum column ${col}` })
    return { calls, understood: true, explanation: `Adding a SUM formula for column ${col}.` }
  }

  const avgCol = lower.match(/(?:average|avg|mean)\s+(?:of\s+)?(?:column\s+)?([a-z])/i)
  if (avgCol) {
    const col = avgCol[1].toUpperCase()
    calls.push({ tool: 'apply_formula', params: { cell: col, formula: '=AVERAGE' }, description: `Average column ${col}` })
    return { calls, understood: true, explanation: `Adding an AVERAGE formula for column ${col}.` }
  }

  // ─── Find max/min ───────────────────────────────────────────────────────────
  if (lower.match(/(?:biggest|largest|highest|max|most expensive)/)) {
    const col = lower.match(/column\s+([a-z])/i)?.[1]?.toUpperCase() || 'B'
    calls.push({ tool: 'find_max', params: { column: col }, description: `Find max in column ${col}` })
    return { calls, understood: true, explanation: `Finding the highest value in column ${col}.` }
  }

  if (lower.match(/(?:smallest|lowest|min|cheapest|least)/)) {
    const col = lower.match(/column\s+([a-z])/i)?.[1]?.toUpperCase() || 'B'
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
  if (containsMatch && lower.match(/(?:highlight|colou?r|mark|shade)/)) {
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
    /(?:highlight|colou?r|mark|shade)\s+(?:the\s+)?cells?\s+(?:that\s+are\s+)?(?:equal(?:s)?(?:\s+to)?|=)\s*\$?([\d,.]+)/,
  )
  if (highlightEquals) {
    const value = parseFloat(highlightEquals[1].replace(/,/g, ''))
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
  if (lower.match(/(?:highlight|colou?r|mark|shade)/) && lower.includes('negative')) {
    const col = lower.match(/column\s+([a-z])/i)?.[1]?.toUpperCase()
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
}

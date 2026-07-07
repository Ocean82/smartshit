import type { IntentType, UserIntent } from './intentTypes.js'

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  read: ['read', 'open', 'load', 'show', 'display', 'view', 'see', "what's in", 'look at', 'preview'],
  analyze: ['analyze', 'analysis', 'insights', 'patterns', 'statistics', 'stats', 'breakdown', 'understand', 'examine', 'evaluate', 'trend', 'overview'],
  write: ['write', 'add', 'insert', 'update', 'change', 'modify', 'set', 'put', 'enter', 'edit', 'replace'],
  format: ['format', 'style', 'bold', 'color', 'highlight', 'font', 'border', 'align', 'width', 'merge'],
  create_chart: ['chart', 'graph', 'plot', 'visualize', 'visualization', 'pie chart', 'bar chart', 'line chart'],
  create_formula: ['formula', 'equation', 'calculate column', 'computed', 'vlookup', 'sumif', 'countif'],
  summarize: ['summarize', 'summary', 'total', 'totals', 'sum up', 'high level', 'quick look', 'brief'],
  filter: ['filter', 'where', 'only show', 'rows where', 'exclude', 'include only', 'greater than', 'less than', 'between', 'top', 'bottom'],
  sort: ['sort', 'order', 'rank', 'arrange', 'ascending', 'descending', 'highest', 'lowest'],
  clean: ['clean', 'fix', 'remove duplicates', 'fill missing', 'trim', 'deduplicate', 'normalize', 'standardize'],
  budget: ['budget', 'spending', 'expenses', 'income', 'savings', 'cost', 'revenue', 'profit', 'loss', 'financial', 'money', 'cash flow'],
  report: ['report', 'generate report', 'export report', 'monthly report', 'weekly report'],
  compare: ['compare', 'difference', 'vs', 'versus', 'against', 'changed', 'comparison'],
  find: ['find', 'search', 'look for', 'locate', 'which', 'where is', 'contains'],
  calculate: ['calculate', 'compute', 'how much', 'what is the total', 'average', 'sum', 'count', 'max', 'min', 'median'],
  export: ['export', 'save as', 'download', 'convert'],
  chat: [],
  unknown: [],
}

const COLUMN_PATTERN = /column\s+"([^"]+)"|column\s+([a-z])|"([^"]+)"\s+column|the\s+(\w+)\s+column/gi
const SHEET_PATTERN = /sheet\s+"([^"]+)"|sheet\s+(\w+)|tab\s+"([^"]+)"|tab\s+(\w+)/i
const ROW_RANGE_PATTERN = /rows?\s+(\d+)\s*(?:to|-|through)\s*(\d+)/i
const TOP_BOTTOM_PATTERN = /(?:top|bottom|first|last)\s+(\d+)/i

function extractColumns(text: string): string[] {
  const columns: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(COLUMN_PATTERN.source, 'gi')
  while ((match = re.exec(text)) !== null) {
    for (const g of match.slice(1)) {
      if (g) columns.push(g.trim())
    }
  }
  return columns
}

function extractSheet(text: string): string | undefined {
  const match = text.match(SHEET_PATTERN)
  if (!match) return undefined
  for (const g of match.slice(1)) {
    if (g) return g.trim()
  }
  return undefined
}

function extractRows(text: string): string | undefined {
  const match = text.match(ROW_RANGE_PATTERN)
  if (match) return `${match[1]}-${match[2]}`
  if (/\ball\b/i.test(text)) return 'all'
  return undefined
}

function extractParameters(text: string, intent: IntentType): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const lower = text.toLowerCase()

  if (intent === 'sort') {
    params.ascending = !/(descending|desc|highest|top|largest)/i.test(lower)
  }

  const nMatch = lower.match(TOP_BOTTOM_PATTERN)
  if (nMatch) {
    params.n = parseInt(nMatch[1], 10)
    params.position = /(top|first|highest)/i.test(lower) ? 'top' : 'bottom'
  }

  if (intent === 'create_chart') {
    for (const chartType of ['bar', 'line', 'pie', 'scatter', 'histogram', 'area']) {
      if (lower.includes(chartType)) {
        params.chartType = chartType
        break
      }
    }
  }

  if (intent === 'export') {
    for (const fmt of ['csv', 'xlsx', 'json', 'pdf', 'html']) {
      if (lower.includes(fmt)) {
        params.format = fmt
        break
      }
    }
  }

  const incomeMatch = lower.match(/\$?(\d[\d,]*)\s*(?:\/|per)\s*month|make\s+\$?(\d[\d,]*)/)
  if (incomeMatch) {
    const raw = incomeMatch[1] ?? incomeMatch[2]
    params.monthlyIncome = Number(raw.replace(/,/g, ''))
  }

  const compareMatch = lower.match(/(\w+)\s*(>=|<=|>|<|=|greater than|less than|more than)\s*(\w+|\d+(?:\.\d+)?)/)
  if (compareMatch) {
    const opMap: Record<string, string> = {
      '>': 'gt',
      '<': 'lt',
      '>=': 'gte',
      '<=': 'lte',
      '=': 'eq',
      'greater than': 'gt',
      'more than': 'gt',
      'less than': 'lt',
    }
    params.compareLeft = compareMatch[1]
    params.compareOp = opMap[compareMatch[2]] ?? 'gt'
    params.compareRight = compareMatch[3]
  }

  return params
}

export function parseUserIntent(userMessage: string): UserIntent {
  const lower = userMessage.toLowerCase().trim()
  const scores: Partial<Record<IntentType, number>> = {}

  for (const [intentType, keywords] of Object.entries(INTENT_KEYWORDS) as [IntentType, string[]][]) {
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.split(' ').length
    }
    if (score > 0) scores[intentType] = score
  }

  let bestIntent: IntentType = 'unknown'
  let bestScore = 0
  for (const [intent, score] of Object.entries(scores)) {
    if ((score ?? 0) > bestScore) {
      bestScore = score ?? 0
      bestIntent = intent as IntentType
    }
  }

  if (bestScore === 0) bestIntent = 'chat'

  if (bestIntent === 'read' && (scores.analyze ?? 0) > 0) {
    bestIntent = 'analyze'
    bestScore += 2
  }

  const topNMatch = lower.match(TOP_BOTTOM_PATTERN)
  if (topNMatch) {
    scores.filter = (scores.filter ?? 0) + 3
    if ((scores.filter ?? 0) >= (scores.budget ?? 0)) {
      bestIntent = 'filter'
      bestScore = scores.filter ?? bestScore
    }
  }

  const params = extractParameters(userMessage, bestIntent)

  if (typeof params.n === 'number' && (scores.filter ?? 0) > 0 && bestIntent !== 'sort') {
    bestIntent = 'filter'
  }

  if (
    (scores.budget ?? 0) > 0
    && ['read', 'analyze', 'summarize'].includes(bestIntent)
    && typeof params.n !== 'number'
  ) {
    bestIntent = 'budget'
  }

  const total = Object.values(scores).reduce((a, b) => a + (b ?? 0), 0)
  const confidence = bestScore === 0 ? 0.3 : Math.min(bestScore / Math.max(total, 1), 1)

  return {
    intentType: bestIntent,
    targetSheet: extractSheet(userMessage),
    targetColumns: extractColumns(userMessage),
    targetRows: extractRows(userMessage),
    filters: {},
    parameters: extractParameters(userMessage, bestIntent),
    rawQuery: userMessage,
    confidence: Math.round(confidence * 100) / 100,
  }
}

export function isQueryIntent(intent: UserIntent): boolean {
  if (['filter', 'sort', 'calculate', 'find', 'analyze'].includes(intent.intentType)) return true
  if (intent.intentType === 'budget' && typeof intent.parameters.n === 'number') {
    return /top|bottom|first|last/i.test(intent.rawQuery)
  }
  return false
}

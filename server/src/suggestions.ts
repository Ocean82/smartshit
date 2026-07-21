import type { IntentType } from '../../shared/intentTypes.js'

/**
 * Suggestion engine — token-overlap scoring against a curated action bank,
 * enhanced with contextual awareness when spreadsheet context is available.
 * Optional future work: vector embeddings for semantic similarity
 * (see docs/planning/24-chat-system-improvements.md Phase 4).
 */

interface SuggestionEntry {
  query: string
  intentType: IntentType
  keywords: string[]
}

interface SheetContextForSuggestions {
  detectedPurpose?: string
  hasMultipleSheets?: boolean
  sheetNames?: string[]
  hasDateColumn?: boolean
  hasCategoryColumn?: boolean
  categoryColumnName?: string
  hasOutliers?: boolean
  hasFinancialData?: boolean
}

const SUGGESTION_BANK: SuggestionEntry[] = [
  { query: 'Analyze my data for patterns', intentType: 'analyze', keywords: ['analyze', 'insight', 'pattern', 'trend', 'statistics', 'explain'] },
  { query: 'Show me the sum of a column', intentType: 'calculate', keywords: ['sum', 'total', 'add', 'calculate', 'amount', 'average'] },
  { query: 'Filter rows by condition', intentType: 'filter', keywords: ['filter', 'where', 'only', 'condition', 'greater', 'less'] },
  { query: 'Create a chart from my data', intentType: 'create_chart', keywords: ['chart', 'graph', 'plot', 'visualize', 'bar', 'pie', 'line'] },
  { query: 'Clean up duplicate rows', intentType: 'clean', keywords: ['clean', 'duplicate', 'remove', 'fix', 'trim', 'normalize'] },
  { query: 'Sort my data', intentType: 'sort', keywords: ['sort', 'order', 'rank', 'ascending', 'descending'] },
  { query: 'Summarize this sheet', intentType: 'summarize', keywords: ['summarize', 'summary', 'overview', 'brief', 'report'] },
  { query: 'Compare two columns', intentType: 'compare', keywords: ['compare', 'difference', 'versus', 'vs', 'variance'] },
  { query: 'Find a specific value', intentType: 'find', keywords: ['find', 'search', 'locate', 'where'] },
  { query: 'Generate a budget breakdown', intentType: 'budget', keywords: ['budget', 'expense', 'income', 'spending', 'cost', 'save', 'savings'] },
  { query: 'Where am I overspending?', intentType: 'budget', keywords: ['overspend', 'losing', 'waste', 'cut', 'risk'] },
  { query: 'How much should I save each month?', intentType: 'budget', keywords: ['save', 'savings', '503020', 'target', 'income'] },
  { query: 'Export my data', intentType: 'export', keywords: ['export', 'download', 'save', 'csv', 'xlsx'] },
  { query: 'Create a formula column', intentType: 'create_formula', keywords: ['formula', 'calculate', 'computed', 'vlookup', 'sum'] },
  { query: 'Explain this spreadsheet I just loaded', intentType: 'analyze', keywords: ['explain', 'loaded', 'sheet', 'mean', 'what'] },
]

const STOP_WORDS = new Set(['a', 'an', 'am', 'the', 'my', 'me', 'i', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'is', 'this', 'that', 'it'])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
}

export function scoreSuggestion(queryTokens: string[], entry: SuggestionEntry): number {
  if (queryTokens.length === 0) return 0
  const keywordSet = new Set(entry.keywords.map((k) => k.toLowerCase()))
  const queryTextTokens = new Set(tokenize(entry.query))
  let score = 0

  for (const token of queryTokens) {
    if (keywordSet.has(token)) score += 3
    else if ([...keywordSet].some((k) => k.includes(token) || token.includes(k))) score += 2
    if (queryTextTokens.has(token)) score += 1
  }

  return score
}

/**
 * Returns contextual follow-up suggestions ranked by token overlap.
 */
export function getSuggestions(query: string, count = 3): string[] {
  if (!query || query.trim().length === 0) return []

  const queryTokens = tokenize(query)
  const scored = SUGGESTION_BANK.map((entry) => ({
    entry,
    score: scoreSuggestion(queryTokens, entry),
  }))

  scored.sort((a, b) => b.score - a.score || a.entry.query.localeCompare(b.entry.query))

  const results: string[] = []
  for (const item of scored) {
    if (item.score <= 0) continue
    if (item.entry.query.toLowerCase() === query.trim().toLowerCase()) continue
    results.push(item.entry.query)
    if (results.length >= count) break
  }

  // Fallback: top diverse intents if nothing scored
  if (results.length === 0) {
    return SUGGESTION_BANK.slice(0, count).map((e) => e.query)
  }

  return results
}

/**
 * Enhanced contextual suggestions that use sheet metadata when available.
 * Falls back to keyword-based scoring if no context is provided.
 */
export function getContextualServerSuggestions(
  query: string,
  sheetContext?: SheetContextForSuggestions,
  count = 3,
): string[] {
  if (!sheetContext) return getSuggestions(query, count)

  const contextual: string[] = []
  const lower = query.toLowerCase()

  // Purpose-specific suggestions
  if (sheetContext.detectedPurpose === 'budget' && !lower.includes('overspend')) {
    contextual.push('Where am I overspending?')
  }
  if (sheetContext.detectedPurpose === 'budget' && !lower.includes('save')) {
    contextual.push('How much should I save each month?')
  }
  if (sheetContext.detectedPurpose === 'sales' && !lower.includes('top')) {
    contextual.push('What are my top-selling items?')
  }
  if (sheetContext.detectedPurpose === 'invoice' && !lower.includes('outstanding')) {
    contextual.push('What is the total outstanding?')
  }

  // Column-aware suggestions
  if (sheetContext.hasDateColumn && !lower.includes('month') && !lower.includes('trend')) {
    contextual.push('Show me totals by month')
  }
  if (sheetContext.hasCategoryColumn && sheetContext.categoryColumnName && !lower.includes('category')) {
    contextual.push(`Group totals by ${sheetContext.categoryColumnName}`)
  }

  // Outlier suggestions
  if (sheetContext.hasOutliers && !lower.includes('unusual') && !lower.includes('outlier')) {
    contextual.push('What makes those values unusual?')
  }

  // Multi-sheet suggestions
  if (sheetContext.hasMultipleSheets && sheetContext.sheetNames && sheetContext.sheetNames.length > 1) {
    const otherSheet = sheetContext.sheetNames.find((n) => !lower.includes(n.toLowerCase()))
    if (otherSheet) {
      contextual.push(`Compare with ${otherSheet} sheet`)
    }
  }

  // Fill remaining slots with keyword-based suggestions
  if (contextual.length < count) {
    const keywordBased = getSuggestions(query, count - contextual.length)
    for (const s of keywordBased) {
      if (!contextual.includes(s)) contextual.push(s)
      if (contextual.length >= count) break
    }
  }

  return contextual.slice(0, count)
}

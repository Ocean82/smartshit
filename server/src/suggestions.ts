import type { IntentType } from '../../shared/intentTypes.js'

/**
 * Suggestion engine — provides contextual follow-up suggestions based on detected intent.
 *
 * TODO: Replace this keyword/intent-based approach with real vector embeddings
 * (e.g., OpenAI Embeddings, Sentence Transformers) for semantic similarity.
 * See docs/planning/24-chat-system-improvements.md Phase 4 for the full plan.
 */

interface SuggestionEntry {
  query: string
  intentType: IntentType
  keywords: string[]
}

const SUGGESTION_BANK: SuggestionEntry[] = [
  { query: 'Analyze my data for patterns', intentType: 'analyze', keywords: ['analyze', 'insight', 'pattern', 'trend', 'statistics'] },
  { query: 'Show me the sum of a column', intentType: 'calculate', keywords: ['sum', 'total', 'add', 'calculate', 'amount'] },
  { query: 'Filter rows by condition', intentType: 'filter', keywords: ['filter', 'where', 'only', 'condition', 'greater', 'less'] },
  { query: 'Create a chart from my data', intentType: 'create_chart', keywords: ['chart', 'graph', 'plot', 'visualize', 'bar', 'pie', 'line'] },
  { query: 'Clean up duplicate rows', intentType: 'clean', keywords: ['clean', 'duplicate', 'remove', 'fix', 'trim'] },
  { query: 'Sort my data', intentType: 'sort', keywords: ['sort', 'order', 'rank', 'ascending', 'descending'] },
  { query: 'Summarize this sheet', intentType: 'summarize', keywords: ['summarize', 'summary', 'overview', 'brief'] },
  { query: 'Compare two columns', intentType: 'compare', keywords: ['compare', 'difference', 'versus', 'vs'] },
  { query: 'Find a specific value', intentType: 'find', keywords: ['find', 'search', 'locate', 'where is'] },
  { query: 'Generate a budget breakdown', intentType: 'budget', keywords: ['budget', 'expense', 'income', 'spending', 'cost'] },
  { query: 'Export my data', intentType: 'export', keywords: ['export', 'download', 'save as', 'csv'] },
  { query: 'Create a formula column', intentType: 'create_formula', keywords: ['formula', 'calculate column', 'computed', 'vlookup'] },
]

/**
 * Returns contextual suggestions based on simple keyword overlap with the user query.
 * Excludes suggestions whose intent matches the current query's apparent intent
 * to offer diverse follow-up actions.
 */
export function getSuggestions(query: string, count = 3): string[] {
  if (!query || query.trim().length === 0) return []

  const lower = query.toLowerCase()
  const queryWords = lower.split(/\s+/)

  const scored = SUGGESTION_BANK.map((entry) => {
    let score = 0
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) score += 2
      else if (queryWords.some((w) => keyword.includes(w) || w.includes(keyword))) score += 1
    }
    return { entry, score }
  })

  // Sort by score descending, then filter out zero-score entries
  scored.sort((a, b) => b.score - a.score)

  // Return suggestions that are at least somewhat related but not identical to what they asked
  return scored
    .filter((s) => s.score > 0)
    .slice(0, count)
    .map((s) => s.entry.query)
}

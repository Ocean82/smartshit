/**
 * Contextual suggestion engine — generates follow-up suggestions based on
 * the actual sheet data and conversation state, not just keyword matching.
 */

import type { SheetInsights } from '@/ai/sheetInsights'
import type { SheetProfile } from '@/ai/types'

interface SuggestionContext {
  insights: SheetInsights
  profile?: SheetProfile
  lastUserMessage: string
  hasMultipleSheets: boolean
  sheetNames: string[]
}

/**
 * Generate contextual follow-up suggestions based on live sheet state.
 * Returns 2-4 suggestions that are actually relevant to the user's data.
 */
export function getContextualSuggestions(ctx: SuggestionContext): string[] {
  const suggestions: Array<{ text: string; priority: number }> = []
  const { insights, profile, lastUserMessage, hasMultipleSheets, sheetNames } = ctx
  const lower = lastUserMessage.toLowerCase()

  // Data-aware suggestions based on detected sheet purpose
  if (profile?.detectedPurpose === 'budget') {
    if (!lower.includes('overspend')) {
      suggestions.push({ text: 'Where am I overspending?', priority: 9 })
    }
    if (!lower.includes('save') && insights.totalIncome) {
      suggestions.push({ text: 'How much should I save each month?', priority: 8 })
    }
    if (insights.categoryTotals?.length && !lower.includes('category')) {
      suggestions.push({ text: 'Break down spending by category', priority: 7 })
    }
  }

  if (profile?.detectedPurpose === 'sales') {
    suggestions.push({ text: 'What are my top-selling items?', priority: 8 })
    suggestions.push({ text: 'Show revenue trends over time', priority: 7 })
  }

  if (profile?.detectedPurpose === 'invoice') {
    suggestions.push({ text: 'What is the total outstanding?', priority: 8 })
    suggestions.push({ text: 'Which invoices are overdue?', priority: 7 })
  }

  // Column-aware suggestions
  const hasDateColumn = profile?.columns.some((c) => c.role === 'date')
  const hasAmountColumn = profile?.columns.some((c) => c.role === 'amount')
  const hasCategoryColumn = profile?.columns.some((c) => c.role === 'category')

  if (hasDateColumn && hasAmountColumn && !lower.includes('month') && !lower.includes('trend')) {
    suggestions.push({ text: 'Show me totals by month', priority: 6 })
  }

  if (hasCategoryColumn && hasAmountColumn && !lower.includes('category')) {
    const catCol = profile?.columns.find((c) => c.role === 'category')
    if (catCol) {
      suggestions.push({ text: `Group totals by ${catCol.name}`, priority: 6 })
    }
  }

  // Insights-based suggestions
  if (insights.outliers?.length && !lower.includes('unusual') && !lower.includes('outlier')) {
    suggestions.push({ text: 'What makes those values unusual?', priority: 8 })
  }

  if (insights.negativeVariances?.length && !lower.includes('variance') && !lower.includes('over budget')) {
    suggestions.push({ text: 'Which categories are over budget?', priority: 7 })
  }

  if (insights.totalExpenses && insights.totalIncome && !lower.includes('cashflow') && !lower.includes('net')) {
    suggestions.push({ text: 'What is my net cashflow?', priority: 5 })
  }

  // Multi-sheet suggestions
  if (hasMultipleSheets && sheetNames.length > 1) {
    const otherSheets = sheetNames.filter((n) => !lower.includes(n.toLowerCase()))
    if (otherSheets.length > 0) {
      suggestions.push({ text: `Compare with ${otherSheets[0]} sheet`, priority: 4 })
    }
  }

  // General follow-ups based on what they just asked
  if (lower.includes('explain') || lower.includes('analyze')) {
    suggestions.push({ text: 'Create a chart from this data', priority: 5 })
    suggestions.push({ text: 'Check for errors or inconsistencies', priority: 5 })
  }

  if (lower.includes('chart') || lower.includes('graph')) {
    suggestions.push({ text: 'Format the headers bold', priority: 3 })
    suggestions.push({ text: 'Sort by largest to smallest', priority: 4 })
  }

  // "What do you know about my data?" prompt
  if (!lower.includes('know') && !lower.includes('context')) {
    suggestions.push({ text: 'What do you know about my data?', priority: 2 })
  }

  // Sort by priority and deduplicate
  suggestions.sort((a, b) => b.priority - a.priority)

  const seen = new Set<string>()
  const results: string[] = []
  for (const s of suggestions) {
    if (!seen.has(s.text) && results.length < 3) {
      seen.add(s.text)
      results.push(s.text)
    }
  }

  // Fallback if nothing contextual
  if (results.length === 0) {
    return [
      'Explain this spreadsheet I just loaded',
      'Analyze my data for patterns',
      'Create a chart from my data',
    ]
  }

  return results
}

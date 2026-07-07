import type { SheetInsights } from '@/ai/sheetInsights'
import type { SheetProfile } from '@/ai/types'
import { formatInsights, formatProfile } from '@/ai/responseBuilder'
import type { ToolResult } from '@/ai/types'

export function generateReport(
  profile: SheetProfile,
  insights: SheetInsights,
  workbookName: string,
): ToolResult {
  const sections = [
    `# ${workbookName} — Summary Report`,
    `**Sheet:** ${profile.name}`,
    `**Detected purpose:** ${profile.detectedPurpose}`,
    `**Dimensions:** ${profile.rowCount} rows x ${profile.colCount} columns`,
    '',
    formatProfile(profile),
    '',
    formatInsights(insights),
    '',
    '## Recommendations',
  ]

  const suggestions: string[] = []
  if (insights.negativeVariances?.length) {
    suggestions.push('Review categories that are over budget.')
    sections.push('- Review categories that are over budget.')
  }
  if (insights.netCashflow !== undefined && insights.netCashflow < 0) {
    suggestions.push('Spending exceeds income — identify top 3 expenses to reduce.')
    sections.push('- Spending exceeds income — identify top 3 expenses to reduce.')
  }
  if (suggestions.length === 0) {
    sections.push('- Data looks balanced. Consider setting a monthly savings target.')
    suggestions.push('Set a monthly savings target.')
  }

  return {
    success: true,
    message: sections.join('\n'),
    suggestions,
    toolUsed: 'reporting',
  }
}

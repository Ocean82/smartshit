import { v4 as uuid } from 'uuid'
import type { ChatMessage } from '@/types'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { SheetProfile, ToolResult } from '@/ai/types'

export function formatInsights(insights: SheetInsights): string {
  const lines: string[] = ['### Sheet insights']

  if (insights.totalIncome !== undefined) lines.push(`- **Income:** $${insights.totalIncome.toFixed(2)}`)
  if (insights.totalExpenses !== undefined) lines.push(`- **Expenses:** $${insights.totalExpenses.toFixed(2)}`)
  if (insights.netCashflow !== undefined) lines.push(`- **Net cashflow:** $${insights.netCashflow.toFixed(2)}`)

  if (insights.topExpenses?.length) {
    lines.push('\n**Top expenses:**')
    for (const e of insights.topExpenses.slice(0, 5)) {
      lines.push(`- ${e.label}: $${e.amount.toFixed(2)}${e.row ? ` (row ${e.row})` : ''}`)
    }
  }

  if (insights.negativeVariances?.length) {
    lines.push('\n**Over budget:**')
    for (const v of insights.negativeVariances.slice(0, 5)) {
      lines.push(`- ${v.label}: ${v.difference.toFixed(2)}`)
    }
  }

  if (insights.outliers?.length) {
    lines.push('\n**Unusual values:**')
    for (const o of insights.outliers.slice(0, 5)) {
      lines.push(`- ${o.column} row ${o.row}: $${o.value.toFixed(2)}`)
    }
  }

  return lines.join('\n')
}

export function formatProfile(profile: SheetProfile): string {
  const lines = [
    `### Sheet: ${profile.name}`,
    `**Purpose:** ${profile.detectedPurpose}`,
    `**Size:** ${profile.rowCount} rows x ${profile.colCount} cols`,
    '\n**Columns:**',
  ]

  for (const col of profile.columns.slice(0, 12)) {
    let line = `- **${col.name}** (${col.role}, ${col.dtype})`
    if (col.sumVal !== undefined) line += ` — sum $${col.sumVal.toFixed(2)}`
    lines.push(line)
  }

  return lines.join('\n')
}

export function formatQueryTable(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return ''
  const lines = ['| Row | Value | Data |', '| --- | ---: | --- |']
  for (const row of data.slice(0, 10)) {
    const item = row as { row?: number; value?: number; cells?: string[] }
    lines.push(`| ${item.row ?? ''} | ${item.value?.toFixed?.(2) ?? item.value ?? ''} | ${(item.cells ?? []).join(' | ')} |`)
  }
  return lines.join('\n')
}

export function mergeToolResultContent(parts: string[]): string {
  return parts.filter(Boolean).join('\n\n')
}

export function toolResultToMessage(
  result: ToolResult,
  options?: { includeSuggestionsInBody?: boolean },
): string {
  const parts = ['### What I found', result.message]
  if (result.data && Array.isArray(result.data)) {
    const table = formatQueryTable(result.data)
    if (table) parts.push('### Evidence\n' + table)
  }
  if (options?.includeSuggestionsInBody !== false && result.suggestions?.length) {
    parts.push('### What I recommend\n' + result.suggestions.map((s) => `- ${s}`).join('\n'))
  }
  if (result.actions?.length) {
    parts.push(
      '### What will change if you apply\n'
      + result.actions.map((a) => `- ${a.description}`).join('\n'),
    )
  }
  return mergeToolResultContent(parts)
}

export function toolResultToChatMessage(
  result: ToolResult,
  meta?: { id?: string; toolUsed?: string; insightsSnapshot?: Record<string, unknown> },
): ChatMessage {
  const actions = (result.actions ?? []).map((action) => {
    const previewChanges = Array.isArray(action.params.previewChanges)
      ? action.params.previewChanges as Array<{ cell: string; oldValue: unknown; newValue: unknown }>
      : undefined
    const changeLabel = previewChanges?.length ? ` (about ${previewChanges.length} changes)` : ''

    return {
      id: uuid(),
      tool: action.tool,
      params: action.params,
      description: `${action.description}${changeLabel}`,
      status: 'pending' as const,
      preview: previewChanges
        ? { changes: previewChanges }
        : undefined,
    }
  })

  return {
    id: meta?.id ?? uuid(),
    role: 'assistant',
    content: toolResultToMessage(result, { includeSuggestionsInBody: false }),
    timestamp: Date.now(),
    suggestions: result.suggestions,
    actions: actions.length > 0 ? actions : undefined,
    toolUsed: result.toolUsed ?? meta?.toolUsed,
    insightsSnapshot: meta?.insightsSnapshot,
  }
}

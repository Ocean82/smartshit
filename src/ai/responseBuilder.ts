import { v4 as uuid } from 'uuid'
import type { ChatMessage, CellChange } from '@/types'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { SheetProfile, ToolResult } from '@/ai/types'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import type { OutlierItem } from '@/ai/outliers'
import { buildActionPreview } from '@/lib/previewBuilders'

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatOutlierLine(o: OutlierItem, includeReason: boolean): string {
  const cell = o.cellRef || `${o.columnLetter || '?'}${o.row}`
  const colName = o.column && !/^Column [A-Z]+$/i.test(o.column) ? ` (${o.column})` : ''
  const label = `- **${cell}**${colName}: ${formatMoney(o.value)}`
  if (!includeReason || o.zScore === undefined || o.mean === undefined) return label

  const absZ = Math.abs(o.zScore).toFixed(1)
  const side = o.direction === 'high' ? 'above' : 'below'
  const typicalLow = o.mean - AI_ANALYSIS_CONFIG.outlierStdThreshold * o.std
  const typicalHigh = o.mean + AI_ANALYSIS_CONFIG.outlierStdThreshold * o.std
  return (
    `${label} — ${absZ}σ ${side} the column ${o.columnLetter || ''} average `
    + `(avg ${formatMoney(o.mean)}; most values fall near ${formatMoney(typicalLow)}–${formatMoney(typicalHigh)})`
  )
}

/** Plain-English explanation of why flagged values are statistical outliers. */
export function explainOutliers(
  outliers: OutlierItem[],
  options?: { threshold?: number },
): string {
  if (!outliers.length) {
    return 'I don\'t currently see statistical outliers in the numeric columns. Unusual flags appear when a value is far from its column average.'
  }

  const threshold = options?.threshold ?? AI_ANALYSIS_CONFIG.outlierStdThreshold
  const lines: string[] = [
    '### Why these values look unusual',
    '',
    `These cells stand out because they are more than **${threshold} standard deviations** from their column average (a common outlier rule). That usually means they are much higher or lower than typical values in the same column — worth verifying, not automatically wrong.`,
    '',
  ]

  for (const o of outliers.slice(0, 8)) {
    lines.push(formatOutlierLine(o, true))
  }

  lines.push(
    '',
    '**What to do next:** check for typos, missing decimals, one-time events, or a different unit in those rows. If the values are correct, they may simply be legitimate extremes.',
  )

  return lines.join('\n')
}

export function formatInsights(insights: SheetInsights): string {
  const lines: string[] = ['### Sheet insights']

  if (insights.totalIncome !== undefined) lines.push(`- **Income:** ${formatMoney(insights.totalIncome)}`)
  if (insights.totalExpenses !== undefined) lines.push(`- **Expenses:** ${formatMoney(insights.totalExpenses)}`)
  if (insights.netCashflow !== undefined) lines.push(`- **Net cashflow:** ${formatMoney(insights.netCashflow)}`)

  if (insights.topExpenses?.length) {
    lines.push('\n**Top expenses:**')
    for (const e of insights.topExpenses.slice(0, 5)) {
      lines.push(`- ${e.label}: ${formatMoney(e.amount)}${e.row ? ` (row ${e.row})` : ''}`)
    }
  }

  if (insights.negativeVariances?.length) {
    lines.push('\n**Over budget:**')
    for (const v of insights.negativeVariances.slice(0, 5)) {
      lines.push(`- ${v.label}: ${v.difference.toFixed(2)}`)
    }
  }

  if (insights.outliers?.length) {
    lines.push(
      `\n**Unusual values** (>${AI_ANALYSIS_CONFIG.outlierStdThreshold}σ from column average):`,
    )
    for (const o of insights.outliers.slice(0, 5)) {
      lines.push(formatOutlierLine(o, true))
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
  meta?: {
    id?: string
    toolUsed?: string
    insightsSnapshot?: Record<string, unknown>
    /** When provided, attach cell-level previews for supported mutate tools */
    previewContext?: {
      sheet: import('@/types').SheetData
      getComputedValue: (row: number, col: number) => string
    }
  },
): ChatMessage {
  const actions = (result.actions ?? []).map((action) => {
    const previewChanges = Array.isArray(action.params.previewChanges)
      ? action.params.previewChanges as CellChange[]
      : undefined
    const built = !previewChanges && meta?.previewContext
      ? buildActionPreview(
        action.tool,
        action.params,
        meta.previewContext.sheet,
        meta.previewContext.getComputedValue,
      )
      : undefined
    const preview = previewChanges
      ? { changes: previewChanges }
      : built
    const changeLabel = preview?.changes.length ? ` (about ${preview.changes.length} changes)` : ''

    return {
      id: uuid(),
      tool: action.tool,
      params: action.params,
      description: `${action.description}${changeLabel}`,
      status: 'pending' as const,
      preview,
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

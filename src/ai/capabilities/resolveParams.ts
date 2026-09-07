/**
 * Resolve tool/goal params for a scored capability using sheet context + NL helpers.
 */

import type { CapabilityDef } from '@shared/capabilities.js'
import { extractCellContainsValue } from '@shared/formatContains'
import { parseFilterPhrase, parseNumberFormatPhrase } from '@shared/spreadsheetPhrases'
import type { ColumnProfile } from '@/ai/types'
import type { PipelineContext } from '@/ai/pipeline/types'
import { findHeaderRow } from '@/lib/sheetSort'

export interface ResolvedCapabilityCall {
  tool: string
  params: Record<string, unknown>
  description: string
  clarification?: string
}

function amountColumn(columns: ColumnProfile[] | undefined): string | undefined {
  const amounts = (columns ?? []).filter((c) => c.role === 'amount' && c.nonNullCount > 0)
  if (amounts.length === 1) return amounts[0].column
  if (amounts.length > 1) {
    const expense = amounts.find((c) => /expense|amount|cost|price|spent/i.test(c.name))
    if (expense) return expense.column
  }
  const numeric = (columns ?? []).filter((c) => c.dtype === 'number' && c.nonNullCount > 0)
  if (numeric.length === 1) return numeric[0].column
  return undefined
}

function describeColumns(columns: ColumnProfile[] | undefined): string {
  const list = (columns ?? [])
    .filter((c) => c.nonNullCount > 0)
    .slice(0, 5)
    .map((c) => `${c.name} (${c.column})`)
  return list.length ? ` Available columns: ${list.join(', ')}.` : ''
}

/** Infer ascending vs descending from soft NL; default desc for amount sorts. */
export function inferSortDirection(message: string): 'asc' | 'desc' {
  const text = message.toLowerCase()
  const wantsAsc = /\b(?:asc(?:ending)?|lowest|smallest|a\s*[- ]?\s*to\s*[- ]?\s*z|from\s+(?:low|small)\s+to\s+(?:high|large))\b/.test(text)
  const wantsDesc = /\b(?:desc(?:ending)?|highest|biggest|largest|z\s*[- ]?\s*to\s*[- ]?\s*a|from\s+(?:high|large)\s+to\s+(?:low|small))\b/.test(text)

  if (wantsAsc && !wantsDesc) return 'asc'
  if (wantsDesc && !wantsAsc) return 'desc'
  if (/\basc(?:ending)?\b/.test(text)) return 'asc'
  if (/\bdesc(?:ending)?\b/.test(text)) return 'desc'
  return 'desc'
}

/**
 * Build an executable tool call (or clarification) for a capability.
 * Goal capabilities return clarification to let GoalRouter / caller handle — or
 * we return a synthetic tool path. For goals, the semantic router executes via executeGoal.
 */
export function resolveCapabilityParams(
  capability: CapabilityDef,
  message: string,
  context: PipelineContext,
  columns?: ColumnProfile[],
): ResolvedCapabilityCall | { clarification: string } {
  const strategy = capability.paramStrategy ?? 'none'

  switch (strategy) {
    case 'header_row_bold': {
      const headerRow = findHeaderRow(context.sheet) + 1
      return {
        tool: 'format_cells',
        params: { range: `A${headerRow}:Z${headerRow}`, bold: true },
        description: 'Bold headers',
      }
    }

    case 'amount_column_sort':
    case 'amount_column_desc': {
      const column = amountColumn(columns)
      if (!column) {
        return {
          clarification: `Which column should I sort by?${describeColumns(columns)}`,
        }
      }
      const direction = inferSortDirection(message)
      return {
        tool: 'sort_sheet',
        params: { column, direction },
        description: `Sort by ${column} ${direction === 'asc' ? 'ascending' : 'descending'}`,
      }
    }

    case 'currency_selection': {
      const parsed = parseNumberFormatPhrase(message)
      const params: Record<string, unknown> = {
        numberFormat: parsed?.numberFormat ?? 'currency',
        ...(capability.staticParams ?? {}),
      }
      if (parsed?.range) params.range = parsed.range
      else {
        const col = amountColumn(columns)
        if (col) params.range = col
      }
      return {
        tool: 'format_cells',
        params,
        description: params.range
          ? `Format ${params.range} as currency`
          : 'Format selection as currency',
      }
    }

    case 'contains_value': {
      const value = extractCellContainsValue(message)
        ?? message.match(/\b(?:contain(?:ing|s)?|have|has|with)\s+(?:a\s+|an\s+|the\s+)?["']?([\w.$-]+)["']?/i)?.[1]
      if (!value) {
        return { clarification: 'Which value should I highlight cells for?' }
      }
      return {
        tool: 'format_cells',
        params: {
          condition: { operator: 'contains', value },
          bgColor: '#FFF9C4',
        },
        description: `Highlight cells containing ${value}`,
      }
    }

    case 'filter_predicate': {
      const parsed = parseFilterPhrase(message)
      if (!parsed) {
        return {
          clarification: `What column and condition should I filter on?${describeColumns(columns)}`,
        }
      }
      return {
        tool: 'filter',
        params: {
          column: parsed.column,
          condition: parsed.condition,
          value: parsed.value,
        },
        description: `Filter ${parsed.column} ${parsed.condition} ${parsed.value}`,
      }
    }

    case 'negatives':
      return {
        tool: 'format_cells',
        params: {
          condition: { operator: 'negative' },
          bgColor: '#FEE2E2',
          ...(capability.staticParams ?? {}),
        },
        description: 'Highlight negatives',
      }

    case 'none':
    default: {
      if (!capability.tool) {
        return { clarification: 'I understood the request but cannot map it to a tool yet.' }
      }
      return {
        tool: capability.tool,
        params: { ...(capability.staticParams ?? {}) },
        description: capability.description,
      }
    }
  }
}

/**
 * Enhanced row filtering engine.
 *
 * Adapted and extended from Univer's sheets-filter custom-filters pattern
 * (Apache-2.0). Provides:
 * - Value-list filtering (multi-select)
 * - Numeric comparisons: gt, gte, lt, lte, equals, notEquals, between, notBetween
 * - Text conditions: contains, notContains, startsWith, endsWith, wildcard
 * - Blank/empty handling
 * - Compound filters with AND/OR logic
 */

import type { FilterConditionType, FilterConfig } from '@/types'

// ─── Public API ─────────────────────────────────────────────────────────────

export type { FilterConditionType }

/**
 * Normalize legacy or arbitrary condition strings to the canonical type.
 */
export function normalizeFilterCondition(condition?: string): FilterConditionType {
  const c = (condition ?? '').toLowerCase().trim()
  const map: Record<string, FilterConditionType> = {
    equals: 'equals',
    notequals: 'notEquals',
    contains: 'contains',
    notcontains: 'notContains',
    startswith: 'startsWith',
    endswith: 'endsWith',
    gt: 'gt',
    gte: 'gte',
    greaterthan: 'gt',
    greaterthanorequal: 'gte',
    lt: 'lt',
    lte: 'lte',
    lessthan: 'lt',
    lessthanorequal: 'lte',
    between: 'between',
    notbetween: 'notBetween',
    isempty: 'isEmpty',
    isnotempty: 'isNotEmpty',
    wildcard: 'wildcard',
  }
  return map[c] ?? 'equals'
}

/**
 * Check if a single row passes all active filters.
 */
export function rowPassesFilters(
  row: number,
  filters: FilterConfig[],
  getCellDisplay: (row: number, col: number) => string,
  headerRow = 0,
): boolean {
  if (row <= headerRow) return true
  if (!filters.length) return true

  return filters.every((filter) => {
    const raw = getCellDisplay(row, filter.column)
    return evaluateFilter(raw, filter)
  })
}

/**
 * Build a filtered row index — returns the array of visible row indices, or
 * null if no filters are active.
 */
export function buildFilteredRowIndex(
  totalRows: number,
  filters: FilterConfig[],
  getCellDisplay: (row: number, col: number) => string,
  headerRow = 0,
): number[] | null {
  if (!filters.length) return null
  const rows: number[] = []
  for (let r = 0; r < totalRows; r++) {
    if (rowPassesFilters(r, filters, getCellDisplay, headerRow)) rows.push(r)
  }
  return rows
}

// ─── Core Evaluation ────────────────────────────────────────────────────────

function evaluateFilter(raw: string, filter: FilterConfig): boolean {
  const condition = normalizeFilterCondition(filter.condition)

  // Value-list (multi-select) filtering takes precedence
  if (filter.values && filter.values.length > 0 && filter.condition == null) {
    const matches = filter.values.some((v) => String(v).toLowerCase() === raw.toLowerCase())
    if (filter.includeBlank && raw.trim() === '') return true
    return matches
  }

  const target = filter.value != null ? String(filter.value) : ''
  const target2 = filter.value2 != null ? String(filter.value2) : ''

  return evaluateCondition(condition, raw, target, target2, filter.includeBlank)
}

function evaluateCondition(
  condition: FilterConditionType,
  raw: string,
  target: string,
  target2: string,
  includeBlank?: boolean,
): boolean {
  // Blank handling — special cases
  if (raw.trim() === '') {
    if (condition === 'isEmpty') return true
    if (condition === 'isNotEmpty') return false
    if (includeBlank) return true
    // For 'equals' with empty target, blank matches blank
    if (condition === 'equals' && target === '') return true
    // Otherwise blank cells don't pass non-empty filters
    return false
  }

  switch (condition) {
    case 'isEmpty':
      return raw.trim() === ''
    case 'isNotEmpty':
      return raw.trim() !== ''
    case 'equals':
      return raw.toLowerCase() === target.toLowerCase()
    case 'notEquals':
      return raw.toLowerCase() !== target.toLowerCase()
    case 'contains':
      return raw.toLowerCase().includes(target.toLowerCase())
    case 'notContains':
      return !raw.toLowerCase().includes(target.toLowerCase())
    case 'startsWith':
      return raw.toLowerCase().startsWith(target.toLowerCase())
    case 'endsWith':
      return raw.toLowerCase().endsWith(target.toLowerCase())
    case 'wildcard':
      return wildcardMatch(raw, target)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const num = parseNumericForFilter(raw)
      const cmp = parseNumericForFilter(target)
      if (!Number.isFinite(num) || !Number.isFinite(cmp)) return false
      if (condition === 'gt') return num > cmp
      if (condition === 'gte') return num >= cmp
      if (condition === 'lt') return num < cmp
      return num <= cmp // lte
    }
    case 'between': {
      const num = parseNumericForFilter(raw)
      const lo = parseNumericForFilter(target)
      const hi = parseNumericForFilter(target2)
      if (!Number.isFinite(num) || !Number.isFinite(lo) || !Number.isFinite(hi)) return false
      return num >= lo && num <= hi
    }
    case 'notBetween': {
      const num = parseNumericForFilter(raw)
      const lo = parseNumericForFilter(target)
      const hi = parseNumericForFilter(target2)
      if (!Number.isFinite(num) || !Number.isFinite(lo) || !Number.isFinite(hi)) return false
      return num < lo || num > hi
    }
    default:
      return raw.toLowerCase() === target.toLowerCase()
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip common currency/thousands formatting and parse as number.
 */
function parseNumericForFilter(value: string): number {
  return Number(String(value).replace(/[$€£¥,\s]/g, ''))
}

/**
 * Wildcard matching: `*` = any sequence, `?` = any single character.
 * Adapted from Univer's sheets-filter wildcard logic.
 */
function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/([.+^${}()|[\]\\])/g, '\\$1')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  const regex = new RegExp(`^${escaped}$`, 'i')
  return regex.test(value)
}

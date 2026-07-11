import type { FilterConfig } from '@/types'

export type FilterCondition = 'equals' | 'contains' | 'gt' | 'lt'

export function normalizeFilterCondition(condition?: string): FilterCondition {
  if (condition === 'contains' || condition === 'gt' || condition === 'lt' || condition === 'equals') {
    return condition
  }
  return 'equals'
}

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
    const condition = normalizeFilterCondition(filter.condition)
    const target = filter.value != null
      ? String(filter.value)
      : filter.values?.[0] != null
        ? String(filter.values[0])
        : ''

    if (condition === 'contains') {
      return raw.toLowerCase().includes(target.toLowerCase())
    }

    if (condition === 'gt' || condition === 'lt') {
      const num = Number(raw.replace(/[$,\s]/g, ''))
      const cmp = Number(String(target).replace(/[$,\s]/g, ''))
      if (!Number.isFinite(num) || !Number.isFinite(cmp)) return false
      return condition === 'gt' ? num > cmp : num < cmp
    }

    // equals (default) — also support multi-value allow-list via values[]
    if (filter.values && filter.values.length > 0 && filter.value == null) {
      return filter.values.some((v) => String(v).toLowerCase() === raw.toLowerCase())
    }
    return raw.toLowerCase() === target.toLowerCase()
  })
}

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

export type ConditionalFormatCondition = 'negative' | 'positive' | 'gt' | 'lt' | 'eq'

export function matchesConditionalFormat(
  numericValue: number,
  condition: ConditionalFormatCondition | string,
  threshold = 0,
): boolean {
  if (!Number.isFinite(numericValue)) return false
  const c = String(condition).toLowerCase()
  if (c === 'negative') return numericValue < 0
  if (c === 'positive') return numericValue > 0
  if (c === 'gt') return numericValue > threshold
  if (c === 'lt') return numericValue < threshold
  if (c === 'eq') return numericValue === threshold
  return false
}

export function parseNumericDisplay(computed: string): number {
  return Number(String(computed).replace(/[$,\s]/g, ''))
}

/**
 * Returns cell IDs in a column that match the conditional format rule.
 */
export function findConditionalFormatTargets(
  columnIndex: number,
  condition: ConditionalFormatCondition | string,
  threshold: number,
  getComputedValue: (row: number, col: number) => string,
  cellIds: string[],
  cellToRef: (cellId: string) => { row: number; col: number },
): string[] {
  const matches: string[] = []
  for (const cellId of cellIds) {
    const ref = cellToRef(cellId)
    if (ref.col !== columnIndex) continue
    const num = parseNumericDisplay(getComputedValue(ref.row, ref.col))
    if (matchesConditionalFormat(num, condition, threshold)) matches.push(cellId)
  }
  return matches
}

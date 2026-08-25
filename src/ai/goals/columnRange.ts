import type { SheetProfile } from '@/ai/types'

/** A1 range for a column's data rows (excludes header and optional totals row). */
export function columnDataRange(profile: SheetProfile | null | undefined, letter: string): string | null {
  if (!profile || !letter || profile.rowCount < 2) return null
  const lastA1 = profile.hasTotalsRow && profile.rowCount > 2
    ? profile.rowCount - 1
    : profile.rowCount
  const firstA1 = profile.hasHeaders ? 2 : 1
  if (firstA1 > lastA1) return null
  return `${letter}${firstA1}:${letter}${lastA1}`
}

export function formatAmount(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

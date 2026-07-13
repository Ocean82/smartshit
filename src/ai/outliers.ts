import { AI_ANALYSIS_CONFIG } from '@/ai/config'

export interface OutlierItem {
  column: string
  /** Excel column letter, e.g. "C" */
  columnLetter: string
  /** A1-style cell ref, e.g. "C9" */
  cellRef: string
  row: number
  value: number
  /** Column mean used for the z-score check */
  mean: number
  /** Column standard deviation */
  std: number
  /** Signed z-score: (value - mean) / std */
  zScore: number
  direction: 'high' | 'low'
}

export function detectOutliers(
  values: Array<{ row: number; value: number }>,
  columnLabel: string,
  columnLetter: string,
): OutlierItem[] {
  if (values.length < 3) return []

  const nums = values.map((v) => v.value)
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length
  const std = Math.sqrt(variance)
  if (std === 0) return []

  const threshold = AI_ANALYSIS_CONFIG.outlierStdThreshold
  return values
    .filter((v) => Math.abs(v.value - mean) > threshold * std)
    .map((v) => {
      const zScore = (v.value - mean) / std
      return {
        column: columnLabel,
        columnLetter,
        cellRef: `${columnLetter}${v.row}`,
        row: v.row,
        value: v.value,
        mean,
        std,
        zScore,
        direction: zScore >= 0 ? 'high' as const : 'low' as const,
      }
    })
}

/** True when the user is asking why previously flagged unusual values stand out. */
export function isOutlierFollowUp(message: string): boolean {
  const lower = message.toLowerCase().trim()
  if (!lower) return false

  const refsUnusual = /unusual|outlier|anomal|those values|these values|those numbers|these numbers|flagged values|weird values/.test(lower)
  const asksWhy = /why|what makes|how (?:are|is|come)|explain|mean by/.test(lower)
  const refsValues = /value|number|row|column|amount|figure|outlier|unusual/.test(lower)

  if (refsUnusual && (asksWhy || /what|tell me|about/.test(lower))) return true
  if (asksWhy && refsValues && /unusual|outlier|high|low|weird|strange/.test(lower)) return true
  return false
}

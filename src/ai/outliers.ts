import { AI_ANALYSIS_CONFIG } from '@/ai/config'

export interface OutlierItem {
  column: string
  row: number
  value: number
}

export function detectOutliers(
  values: Array<{ row: number; value: number }>,
  columnLabel: string,
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
    .map((v) => ({ column: columnLabel, row: v.row, value: v.value }))
}

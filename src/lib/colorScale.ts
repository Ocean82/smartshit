/**
 * Color Scale utilities — compute gradient colors for heatmap-style conditional formatting.
 *
 * Adapted from Univer's color-scale-calculate-unit (Apache-2.0).
 * Provides 2-color and 3-color scale interpolation with configurable stops.
 */

import type { ColorScaleStop } from '@/types'

// ─── Preset Color Scales ────────────────────────────────────────────────────

/** Green (low) → Yellow (mid) → Red (high) — classic heat map. */
export const COLOR_SCALE_GYR: ColorScaleStop[] = [
  { type: 'min', color: '#63be7b' },
  { type: 'percent', value: 50, color: '#ffeb84' },
  { type: 'max', color: '#f8696b' },
]

/** Red (low) → Yellow (mid) → Green (high) — performance scale. */
export const COLOR_SCALE_RYG: ColorScaleStop[] = [
  { type: 'min', color: '#f8696b' },
  { type: 'percent', value: 50, color: '#ffeb84' },
  { type: 'max', color: '#63be7b' },
]

/** White (low) → Blue (high) — clean density map. */
export const COLOR_SCALE_WB: ColorScaleStop[] = [
  { type: 'min', color: '#ffffff' },
  { type: 'max', color: '#2563eb' },
]

/** White (low) → Red (high) — expense intensity. */
export const COLOR_SCALE_WR: ColorScaleStop[] = [
  { type: 'min', color: '#ffffff' },
  { type: 'max', color: '#dc2626' },
]

/** Green (low) → White (mid) → Red (high) — diverging for P&L. */
export const COLOR_SCALE_GWR: ColorScaleStop[] = [
  { type: 'min', color: '#22c55e' },
  { type: 'percent', value: 50, color: '#ffffff' },
  { type: 'max', color: '#ef4444' },
]

/** Blue (low) → White (mid) → Orange (high) — diverging temperature. */
export const COLOR_SCALE_BWO: ColorScaleStop[] = [
  { type: 'min', color: '#3b82f6' },
  { type: 'percent', value: 50, color: '#ffffff' },
  { type: 'max', color: '#f97316' },
]

export const PRESET_COLOR_SCALES: { id: string; name: string; stops: ColorScaleStop[] }[] = [
  { id: 'gyr', name: 'Green-Yellow-Red', stops: COLOR_SCALE_GYR },
  { id: 'ryg', name: 'Red-Yellow-Green', stops: COLOR_SCALE_RYG },
  { id: 'wb', name: 'White-Blue', stops: COLOR_SCALE_WB },
  { id: 'wr', name: 'White-Red', stops: COLOR_SCALE_WR },
  { id: 'gwr', name: 'Green-White-Red (Diverging)', stops: COLOR_SCALE_GWR },
  { id: 'bwo', name: 'Blue-White-Orange (Diverging)', stops: COLOR_SCALE_BWO },
]

// ─── Color Computation ──────────────────────────────────────────────────────

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function rgbToHex(rgb: RGB): string {
  const r = Math.round(Math.max(0, Math.min(255, rgb.r))).toString(16).padStart(2, '0')
  const g = Math.round(Math.max(0, Math.min(255, rgb.g))).toString(16).padStart(2, '0')
  const b = Math.round(Math.max(0, Math.min(255, rgb.b))).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interpolateRgb(c1: RGB, c2: RGB, t: number): RGB {
  return { r: lerp(c1.r, c2.r, t), g: lerp(c1.g, c2.g, t), b: lerp(c1.b, c2.b, t) }
}

/**
 * Resolve stop values to their actual numeric positions given a data range.
 */
function resolveStopValue(
  stop: ColorScaleStop,
  values: number[],
  min: number,
  max: number,
): number {
  switch (stop.type) {
    case 'min':
      return min
    case 'max':
      return max
    case 'number':
      return stop.value ?? min
    case 'percent':
      return min + ((stop.value ?? 50) / 100) * (max - min)
    case 'percentile': {
      const pct = (stop.value ?? 50) / 100
      const sorted = [...values].sort((a, b) => a - b)
      const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(pct * sorted.length)))
      return sorted[idx]
    }
    default:
      return min
  }
}

/**
 * Compute the color for a single value given a color scale configuration
 * and the full set of peer values.
 *
 * @param value - The cell's numeric value.
 * @param peerValues - All numeric values in the same column/range.
 * @param stops - The color scale configuration (2 or 3 stops).
 * @returns Hex color string, or null if the value can't be scaled.
 */
export function computeScaleColor(
  value: number,
  peerValues: number[],
  stops: ColorScaleStop[],
): string | null {
  if (!Number.isFinite(value) || peerValues.length === 0 || stops.length < 2) return null

  const min = Math.min(...peerValues)
  const max = Math.max(...peerValues)
  if (min === max) return stops[0].color

  // Resolve each stop's actual value
  const resolved = stops.map((s) => ({
    value: resolveStopValue(s, peerValues, min, max),
    color: hexToRgb(s.color),
  }))

  // Sort resolved stops by value (ascending)
  resolved.sort((a, b) => a.value - b.value)

  // Clamp value to resolved range
  if (value <= resolved[0].value) return rgbToHex(resolved[0].color)
  if (value >= resolved[resolved.length - 1].value) return rgbToHex(resolved[resolved.length - 1].color)

  // Find the segment this value falls into
  for (let i = 0; i < resolved.length - 1; i++) {
    const lo = resolved[i]
    const hi = resolved[i + 1]
    if (value >= lo.value && value <= hi.value) {
      const range = hi.value - lo.value
      const t = range === 0 ? 0 : (value - lo.value) / range
      return rgbToHex(interpolateRgb(lo.color, hi.color, t))
    }
  }

  return stops[0].color
}

/**
 * Batch-compute color scale for an entire array of values.
 * More efficient than calling computeScaleColor individually.
 */
export function computeScaleColors(
  values: (number | null)[],
  stops: ColorScaleStop[],
): (string | null)[] {
  const numericValues = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (numericValues.length === 0 || stops.length < 2) {
    return values.map(() => null)
  }

  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return null
    return computeScaleColor(v, numericValues, stops)
  })
}

/**
 * Determine appropriate text color (black or white) for readability
 * against a given background color.
 */
export function getContrastTextColor(bgHex: string): string {
  const rgb = hexToRgb(bgHex)
  // Relative luminance calculation (simplified)
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

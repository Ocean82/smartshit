/**
 * Conditional formatting engine — enhanced with color scales, icon sets,
 * duplicate/unique detection, top/bottom N, and above/below average rules.
 *
 * Adapted from Univer's sheets-conditional-formatting patterns (Apache-2.0).
 */

import type {
  CellFormat,
  ColorScaleStop,
  ConditionalRule,
  ConditionalRuleType,
  IconSetConfig,
  IconSetType,
  SheetData,
} from '@/types'
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

// ─── Re-exports for backward compat ────────────────────────────────────────

export type ConditionalFormatCondition = 'negative' | 'positive' | 'gt' | 'lt' | 'eq' | 'dataBar'

// ─── Icon Set Definitions ───────────────────────────────────────────────────

/**
 * Unicode-based icon sets for conditional formatting display.
 * Uses emoji/symbols so no external assets are needed.
 */
export const ICON_SETS: Record<IconSetType, string[]> = {
  '3Arrows': ['↑', '→', '↓'],
  '3ArrowsGray': ['⬆', '➡', '⬇'],
  '3TrafficLights': ['🟢', '🟡', '🔴'],
  '3Signs': ['🟢', '⚠️', '🔴'],
  '3Flags': ['🟩', '🟨', '🟥'],
  '3Stars': ['★★★', '★★☆', '★☆☆'],
  '3Symbols': ['✓', '!', '✗'],
  '4Arrows': ['↑', '↗', '↘', '↓'],
  '4ArrowsGray': ['⬆', '⬈', '⬊', '⬇'],
  '4TrafficLights': ['🟢', '🟡', '🟠', '🔴'],
  '4Rating': ['████', '███░', '██░░', '█░░░'],
  '5Arrows': ['↑', '↗', '→', '↘', '↓'],
  '5ArrowsGray': ['⬆', '⬈', '➡', '⬊', '⬇'],
  '5Rating': ['█████', '████░', '███░░', '██░░░', '█░░░░'],
  '5Quarters': ['●', '◕', '◑', '◔', '○'],
}

// ─── Color Interpolation ────────────────────────────────────────────────────

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

function interpolateColor(color1: RGB, color2: RGB, t: number): RGB {
  return {
    r: color1.r + (color2.r - color1.r) * t,
    g: color1.g + (color2.g - color1.g) * t,
    b: color1.b + (color2.b - color1.b) * t,
  }
}

/**
 * Compute the interpolated color for a value within a color scale.
 * Supports 2-color and 3-color scales.
 */
export function getColorScaleColor(
  value: number,
  min: number,
  max: number,
  stops: ColorScaleStop[],
): string | null {
  if (min === max) return stops[0]?.color ?? null
  if (stops.length < 2) return null

  // Normalize to 0..1
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))

  if (stops.length === 2) {
    const c1 = hexToRgb(stops[0].color)
    const c2 = hexToRgb(stops[1].color)
    return rgbToHex(interpolateColor(c1, c2, t))
  }

  // 3-color scale: first half interpolates stop[0]→stop[1], second half stop[1]→stop[2]
  if (t <= 0.5) {
    const localT = t / 0.5
    const c1 = hexToRgb(stops[0].color)
    const c2 = hexToRgb(stops[1].color)
    return rgbToHex(interpolateColor(c1, c2, localT))
  } else {
    const localT = (t - 0.5) / 0.5
    const c1 = hexToRgb(stops[1].color)
    const c2 = hexToRgb(stops[2].color)
    return rgbToHex(interpolateColor(c1, c2, localT))
  }
}

// ─── Icon Set Evaluation ────────────────────────────────────────────────────

/**
 * Get the icon for a value based on its percentile position within peer values.
 */
export function getIconForValue(
  value: number,
  min: number,
  max: number,
  config: IconSetConfig,
): string | null {
  const icons = ICON_SETS[config.iconSetType]
  if (!icons) return null

  const count = icons.length
  const thresholds = config.thresholds

  if (min === max) return icons[0]

  // Calculate percentage position
  const pct = ((value - min) / (max - min)) * 100

  // Map thresholds to icon index — thresholds are descending boundaries
  let iconIndex = count - 1 // lowest by default
  for (let i = 0; i < thresholds.length; i++) {
    if (pct >= thresholds[i]) {
      iconIndex = i
      break
    }
  }

  if (config.reverseOrder) {
    iconIndex = count - 1 - iconIndex
  }

  return icons[Math.max(0, Math.min(count - 1, iconIndex))]
}

// ─── Core Matching ──────────────────────────────────────────────────────────

export function parseNumericDisplay(computed: string): number {
  return Number(String(computed).replace(/[$€£¥,\s]/g, ''))
}

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
  if (c === 'databar') return true
  return false
}

export function conditionToRule(
  condition: ConditionalFormatCondition | string,
  color: string,
  threshold = 0,
): ConditionalRule {
  const c = String(condition).toLowerCase()
  const style: Partial<CellFormat> = { bgColor: color }
  if (c === 'databar') {
    return { type: 'dataBar', value: 0, style: {}, dataBarColor: color }
  }
  if (c === 'negative') return { type: 'lessThan', value: 0, style }
  if (c === 'positive') return { type: 'greaterThan', value: 0, style }
  if (c === 'gt') return { type: 'greaterThan', value: threshold, style }
  if (c === 'lt') return { type: 'lessThan', value: threshold, style }
  if (c === 'eq') return { type: 'equals', value: threshold, style }
  return { type: 'lessThan', value: 0, style }
}

/**
 * Evaluate whether a rule matches a computed cell value.
 * Extended to support new rule types: notEquals, notBetween, duplicateValues, etc.
 */
export function ruleMatchesComputed(rule: ConditionalRule, computed: string): boolean {
  if (rule.type === 'text') {
    return computed.toLowerCase().includes(String(rule.value).toLowerCase())
  }
  if (rule.type === 'dataBar' || rule.type === 'colorScale' || rule.type === 'iconSet') {
    return Number.isFinite(parseNumericDisplay(computed))
  }
  // duplicate/unique/top/bottom/average are evaluated at the column level, not per-cell
  if (
    rule.type === 'duplicateValues' ||
    rule.type === 'uniqueValues' ||
    rule.type === 'top10' ||
    rule.type === 'bottom10' ||
    rule.type === 'aboveAverage' ||
    rule.type === 'belowAverage'
  ) {
    return true // These are resolved externally before being applied
  }

  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num)) return false
  switch (rule.type) {
    case 'greaterThan':
      return num > Number(rule.value)
    case 'lessThan':
      return num < Number(rule.value)
    case 'equals':
      return num === Number(rule.value)
    case 'notEquals':
      return num !== Number(rule.value)
    case 'between':
      return num >= Number(rule.value) && num <= Number(rule.value2 ?? rule.value)
    case 'notBetween':
      return num < Number(rule.value) || num > Number(rule.value2 ?? rule.value)
    default:
      return false
  }
}

// ─── Format Resolution ──────────────────────────────────────────────────────

/** Merge base format with styles from matching conditional rules. */
export function resolveCellFormat(
  format: CellFormat | undefined,
  computedValue: string,
): CellFormat | undefined {
  if (!format) return undefined
  const rules = format.conditionalRules
  if (!rules?.length) return format

  let merged: CellFormat = { ...format }
  for (const rule of rules) {
    if (rule.type === 'dataBar' || rule.type === 'colorScale' || rule.type === 'iconSet') continue
    if (!ruleMatchesComputed(rule, computedValue)) continue
    merged = {
      ...merged,
      ...rule.style,
      borders: rule.style.borders
        ? { ...merged.borders, ...rule.style.borders }
        : merged.borders,
    }
  }
  return merged
}

// ─── Data Bars ──────────────────────────────────────────────────────────────

/** Active data-bar rule on a cell, if the computed value is numeric. */
export function getDataBarRule(
  format: CellFormat | undefined,
  computedValue: string,
): ConditionalRule | null {
  const rule = format?.conditionalRules?.find((r) => r.type === 'dataBar')
  if (!rule) return null
  if (!ruleMatchesComputed(rule, computedValue)) return null
  return rule
}

/**
 * Proportional fill 0–100 for a numeric value among peer column values.
 * Enhanced: supports negative values with bidirectional bars.
 */
export function dataBarWidthPercent(computed: string, peerValues: number[]): number | null {
  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num) || peerValues.length === 0) return null
  const min = Math.min(...peerValues)
  const max = Math.max(...peerValues)
  if (max === min) return max === 0 ? 0 : 100
  return Math.max(0, Math.min(100, ((num - min) / (max - min)) * 100))
}

/**
 * Enhanced data bar info for bidirectional rendering (handles negatives).
 * Returns startPoint (0-100) and bar width (0-100), supporting positive/negative bars.
 */
export function getDataBarInfo(
  computed: string,
  peerValues: number[],
): { startPoint: number; width: number; isNegative: boolean } | null {
  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num) || peerValues.length === 0) return null

  const min = Math.min(...peerValues)
  const max = Math.max(...peerValues)

  if (max === min) return { startPoint: 0, width: max === 0 ? 0 : 100, isNegative: false }

  // Calculate start point (where zero is)
  let startPoint: number
  if (min >= 0) {
    startPoint = 0
  } else if (max <= 0) {
    startPoint = 100
  } else {
    startPoint = (Math.abs(min) / (Math.abs(min) + Math.abs(max))) * 100
  }

  if (num === 0) {
    return { startPoint, width: 0, isNegative: false }
  }

  if (num > 0) {
    const width = max > 0 ? (num / max) * (100 - startPoint) : 0
    return { startPoint, width: Math.min(100, width), isNegative: false }
  } else {
    const width = min < 0 ? (Math.abs(num) / Math.abs(min)) * startPoint : 0
    return { startPoint, width: Math.min(100, width), isNegative: true }
  }
}

// ─── Color Scale Helpers ────────────────────────────────────────────────────

/** Get color scale rule from a cell's format. */
export function getColorScaleRule(format: CellFormat | undefined): ConditionalRule | null {
  return format?.conditionalRules?.find((r) => r.type === 'colorScale') ?? null
}

/**
 * Compute a color scale background for a cell given its column peer values.
 */
export function computeColorScaleBg(
  computed: string,
  peerValues: number[],
  config: ColorScaleStop[],
): string | null {
  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num) || peerValues.length === 0 || config.length < 2) return null
  const min = Math.min(...peerValues)
  const max = Math.max(...peerValues)
  return getColorScaleColor(num, min, max, config)
}

// ─── Icon Set Helpers ───────────────────────────────────────────────────────

/** Get icon set rule from a cell's format. */
export function getIconSetRule(format: CellFormat | undefined): ConditionalRule | null {
  return format?.conditionalRules?.find((r) => r.type === 'iconSet') ?? null
}

/**
 * Compute the icon for a cell given its column peer values.
 */
export function computeIconForCell(
  computed: string,
  peerValues: number[],
  config: IconSetConfig,
): string | null {
  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num) || peerValues.length === 0) return null
  const min = Math.min(...peerValues)
  const max = Math.max(...peerValues)
  return getIconForValue(num, min, max, config)
}

// ─── Statistical Rule Evaluators ────────────────────────────────────────────

/**
 * Identify duplicate values in a column.
 * Returns a Set of computed values that appear more than once.
 */
export function findDuplicateValues(computedValues: string[]): Set<string> {
  const counts = new Map<string, number>()
  for (const v of computedValues) {
    const key = v.toLowerCase().trim()
    if (key === '') continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const dupes = new Set<string>()
  for (const [key, count] of counts) {
    if (count > 1) dupes.add(key)
  }
  return dupes
}

/**
 * Identify unique (non-duplicate) values in a column.
 */
export function findUniqueValues(computedValues: string[]): Set<string> {
  const counts = new Map<string, number>()
  for (const v of computedValues) {
    const key = v.toLowerCase().trim()
    if (key === '') continue
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const uniques = new Set<string>()
  for (const [key, count] of counts) {
    if (count === 1) uniques.add(key)
  }
  return uniques
}

/**
 * Get the top N values from numeric peer values.
 */
export function getTopNValues(peerValues: number[], n: number): Set<number> {
  const sorted = [...peerValues].sort((a, b) => b - a)
  return new Set(sorted.slice(0, n))
}

/**
 * Get the bottom N values from numeric peer values.
 */
export function getBottomNValues(peerValues: number[], n: number): Set<number> {
  const sorted = [...peerValues].sort((a, b) => a - b)
  return new Set(sorted.slice(0, n))
}

/**
 * Calculate the mean of numeric values.
 */
export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// ─── Column-Level Helpers ───────────────────────────────────────────────────

/** Collect finite numeric values for cells that carry a dataBar rule in a column. */
export function columnDataBarPeerValues(
  sheet: SheetData,
  columnIndex: number,
  getComputedValue: (row: number, col: number) => string,
): number[] {
  const values: number[] = []
  for (const cellId of columnDataCellIds(sheet, columnIndex)) {
    const cell = sheet.cells[cellId]
    if (!cell?.format?.conditionalRules?.some((r) => r.type === 'dataBar')) continue
    const parsed = cellToRef(cellId)
    const num = parseNumericDisplay(getComputedValue(parsed.row, parsed.col))
    if (Number.isFinite(num)) values.push(num)
  }
  return values
}

/** Collect finite numeric values for cells that carry a colorScale rule in a column. */
export function columnColorScalePeerValues(
  sheet: SheetData,
  columnIndex: number,
  getComputedValue: (row: number, col: number) => string,
): number[] {
  const values: number[] = []
  for (const cellId of columnDataCellIds(sheet, columnIndex)) {
    const cell = sheet.cells[cellId]
    if (!cell?.format?.conditionalRules?.some((r) => r.type === 'colorScale')) continue
    const parsed = cellToRef(cellId)
    const num = parseNumericDisplay(getComputedValue(parsed.row, parsed.col))
    if (Number.isFinite(num)) values.push(num)
  }
  return values
}

/** Collect finite numeric values for cells that carry an iconSet rule in a column. */
export function columnIconSetPeerValues(
  sheet: SheetData,
  columnIndex: number,
  getComputedValue: (row: number, col: number) => string,
): number[] {
  const values: number[] = []
  for (const cellId of columnDataCellIds(sheet, columnIndex)) {
    const cell = sheet.cells[cellId]
    if (!cell?.format?.conditionalRules?.some((r) => r.type === 'iconSet')) continue
    const parsed = cellToRef(cellId)
    const num = parseNumericDisplay(getComputedValue(parsed.row, parsed.col))
    if (Number.isFinite(num)) values.push(num)
  }
  return values
}

export function findConditionalFormatTargets(
  columnIndex: number,
  condition: ConditionalFormatCondition | string,
  threshold: number,
  getComputedValue: (row: number, col: number) => string,
  cellIds: string[],
  toRef: (cellId: string) => { row: number; col: number },
): string[] {
  const matches: string[] = []
  for (const cellId of cellIds) {
    const ref = toRef(cellId)
    if (ref.col !== columnIndex) continue
    const num = parseNumericDisplay(getComputedValue(ref.row, ref.col))
    if (matchesConditionalFormat(num, condition, threshold)) matches.push(cellId)
  }
  return matches
}

export function columnDataCellIds(sheet: SheetData, columnIndex: number): string[] {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const ids: string[] = []
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const cellId = refToCell(r, columnIndex)
    const cell = sheet.cells[cellId]
    if (!cell) continue
    const hasValue = cell.value != null && cell.value !== ''
    const hasFormula = !!cell.formula
    if (hasValue || hasFormula) ids.push(cellId)
  }
  return ids
}

/** @deprecated Prefer columnDataCellIds — kept for callers that need the full row span. */
export function columnCellIdsInUsedRange(sheet: SheetData, columnIndex: number): string[] {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const ids: string[] = []
  for (let r = headerRow; r <= lastRow; r++) {
    ids.push(refToCell(r, columnIndex))
  }
  return ids
}

export function attachConditionalRuleToColumn(
  sheet: SheetData,
  columnIndex: number,
  rule: ConditionalRule,
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void,
): number {
  const ids = columnDataCellIds(sheet, columnIndex)
  for (const cellId of ids) {
    setCellFormat(cellId, { conditionalRules: [rule], bgColor: undefined })
  }
  return ids.length
}

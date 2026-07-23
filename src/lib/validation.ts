/**
 * Cell validation engine — pure functions for validating cell values.
 *
 * Extracted from the store to enable proper testing and eliminate the
 * `new Function` XSS risk in the old `custom` validation type.
 *
 * Validation types:
 * - number: min/max with operators (between, gt, lt, eq, gte, lte, neq)
 * - list: value must be in a predefined set
 * - text: length constraints, contains
 * - date: before/after/between date ranges
 * - formula: expression evaluated safely (no eval/new Function)
 */

import type { DataValidation } from '@/types'

export interface ValidationResult {
  valid: boolean
  message?: string
}

export type ComputedValueGetter = (row: number, col: number) => string

/**
 * Validate a cell value against its validation rule.
 *
 * @param value - The raw cell value being written
 * @param validation - The validation rule on this cell
 * @param context - Optional: for formula validation, provides cell position and computed values
 */
export function validateCell(
  value: string | number | null,
  validation: DataValidation | null | undefined,
  context?: { row: number; col: number; getComputedValue?: ComputedValueGetter },
): ValidationResult {
  if (!validation) return { valid: true }

  const strVal = value == null ? '' : String(value)

  switch (validation.type) {
    case 'number':
      return validateNumber(strVal, validation)
    case 'list':
      return validateList(strVal, validation)
    case 'text':
      return validateText(strVal, validation)
    case 'date':
      return validateDate(strVal, validation)
    case 'checkbox':
      return validateCheckbox(strVal, validation)
    case 'custom':
      return validateFormula(value, validation, context)
    default:
      return { valid: true }
  }
}

// ─── Number validation ──────────────────────────────────────────────────────

function validateNumber(strVal: string, v: DataValidation): ValidationResult {
  if (strVal === '') return { valid: true } // empty cells pass

  const num = Number(strVal)
  if (isNaN(num)) {
    return { valid: false, message: v.message || 'Must be a number' }
  }

  const criteria = v.criteria || 'between'

  switch (criteria) {
    case 'between':
      if (v.min != null && num < v.min) return { valid: false, message: v.message || `Must be ≥ ${v.min}` }
      if (v.max != null && num > v.max) return { valid: false, message: v.message || `Must be ≤ ${v.max}` }
      return { valid: true }
    case 'notBetween':
      if (v.min != null && v.max != null && num >= v.min && num <= v.max)
        return { valid: false, message: v.message || `Must not be between ${v.min} and ${v.max}` }
      return { valid: true }
    case 'greaterThan':
      if (v.min != null && num <= v.min) return { valid: false, message: v.message || `Must be > ${v.min}` }
      return { valid: true }
    case 'lessThan':
      if (v.max != null && num >= v.max) return { valid: false, message: v.message || `Must be < ${v.max}` }
      return { valid: true }
    case 'greaterThanOrEqual':
      if (v.min != null && num < v.min) return { valid: false, message: v.message || `Must be ≥ ${v.min}` }
      return { valid: true }
    case 'lessThanOrEqual':
      if (v.max != null && num > v.max) return { valid: false, message: v.message || `Must be ≤ ${v.max}` }
      return { valid: true }
    case 'equalTo':
      if (v.min != null && num !== v.min) return { valid: false, message: v.message || `Must equal ${v.min}` }
      return { valid: true }
    case 'notEqualTo':
      if (v.min != null && num === v.min) return { valid: false, message: v.message || `Must not equal ${v.min}` }
      return { valid: true }
    default:
      // Legacy fallback: simple min/max
      if (v.min != null && num < v.min) return { valid: false, message: v.message || `Must be ≥ ${v.min}` }
      if (v.max != null && num > v.max) return { valid: false, message: v.message || `Must be ≤ ${v.max}` }
      return { valid: true }
  }
}

// ─── List validation ────────────────────────────────────────────────────────

function validateList(strVal: string, v: DataValidation): ValidationResult {
  if (strVal === '') return { valid: true }
  if (v.values && !v.values.includes(strVal)) {
    return { valid: false, message: v.message || `Must be one of: ${v.values.join(', ')}` }
  }
  return { valid: true }
}

// ─── Text validation ────────────────────────────────────────────────────────

function validateText(strVal: string, v: DataValidation): ValidationResult {
  if (strVal === '') return { valid: true }

  const criteria = v.criteria || ''

  switch (criteria) {
    case 'length':
      if (v.min != null && strVal.length < v.min)
        return { valid: false, message: v.message || `Must be at least ${v.min} characters` }
      if (v.max != null && strVal.length > v.max)
        return { valid: false, message: v.message || `Must be at most ${v.max} characters` }
      return { valid: true }
    case 'contains':
      if (v.containsText && !strVal.toLowerCase().includes(v.containsText.toLowerCase()))
        return { valid: false, message: v.message || `Must contain "${v.containsText}"` }
      return { valid: true }
    case 'notContains':
      if (v.containsText && strVal.toLowerCase().includes(v.containsText.toLowerCase()))
        return { valid: false, message: v.message || `Must not contain "${v.containsText}"` }
      return { valid: true }
    case 'startsWith':
      if (v.containsText && !strVal.toLowerCase().startsWith(v.containsText.toLowerCase()))
        return { valid: false, message: v.message || `Must start with "${v.containsText}"` }
      return { valid: true }
    case 'endsWith':
      if (v.containsText && !strVal.toLowerCase().endsWith(v.containsText.toLowerCase()))
        return { valid: false, message: v.message || `Must end with "${v.containsText}"` }
      return { valid: true }
    default:
      return { valid: true }
  }
}

// ─── Date validation ────────────────────────────────────────────────────────

function validateDate(strVal: string, v: DataValidation): ValidationResult {
  if (strVal === '') return { valid: true }

  const parsed = Date.parse(strVal)
  if (isNaN(parsed)) {
    return { valid: false, message: v.message || 'Must be a valid date' }
  }

  const dateVal = new Date(parsed).getTime()
  const criteria = v.criteria || ''

  switch (criteria) {
    case 'after':
      if (v.dateMin) {
        const minDate = Date.parse(v.dateMin)
        if (!isNaN(minDate) && dateVal <= minDate)
          return { valid: false, message: v.message || `Must be after ${v.dateMin}` }
      }
      return { valid: true }
    case 'before':
      if (v.dateMax) {
        const maxDate = Date.parse(v.dateMax)
        if (!isNaN(maxDate) && dateVal >= maxDate)
          return { valid: false, message: v.message || `Must be before ${v.dateMax}` }
      }
      return { valid: true }
    case 'between':
      if (v.dateMin) {
        const minDate = Date.parse(v.dateMin)
        if (!isNaN(minDate) && dateVal < minDate)
          return { valid: false, message: v.message || `Must be on or after ${v.dateMin}` }
      }
      if (v.dateMax) {
        const maxDate = Date.parse(v.dateMax)
        if (!isNaN(maxDate) && dateVal > maxDate)
          return { valid: false, message: v.message || `Must be on or before ${v.dateMax}` }
      }
      return { valid: true }
    default:
      return { valid: true }
  }
}

// ─── Checkbox validation ─────────────────────────────────────────────────────

function validateCheckbox(strVal: string, v: DataValidation): ValidationResult {
  // Empty is valid (unchecked state)
  if (strVal === '') return { valid: true }

  const checked = v.checkedValue ?? 'TRUE'
  const unchecked = v.uncheckedValue ?? 'FALSE'

  const upper = strVal.toUpperCase()
  if (upper === checked.toUpperCase() || upper === unchecked.toUpperCase()) {
    return { valid: true }
  }

  // Also allow boolean-like values
  if (['1', '0', 'YES', 'NO', 'TRUE', 'FALSE'].includes(upper)) {
    return { valid: true }
  }

  return { valid: false, message: v.message || `Must be "${checked}" or "${unchecked}"` }
}

// ─── Formula/Custom validation ──────────────────────────────────────────────

/**
 * Safe formula validation. Instead of `new Function` (XSS risk), we support
 * a limited set of safe expression patterns:
 * - "value > 0" — comparison against the cell value
 * - "value >= 100 && value <= 200" — compound comparisons
 * - "value !== 0" — inequality
 *
 * For more complex validation, the custom type now evaluates a restricted
 * expression parser rather than arbitrary JavaScript.
 */
function validateFormula(
  value: string | number | null,
  v: DataValidation,
  _context?: { row: number; col: number; getComputedValue?: ComputedValueGetter },
): ValidationResult {
  if (!v.criteria) return { valid: true }
  if (value == null || value === '') return { valid: true }

  const numVal = typeof value === 'number' ? value : parseFloat(String(value))
  const expression = v.criteria.trim()

  // Safe expression evaluation using regex-based parsing
  const result = evaluateSafeExpression(expression, value, numVal)
  if (result === null) {
    // If we can't safely evaluate, pass validation (don't block the user)
    return { valid: true }
  }

  return result
    ? { valid: true }
    : { valid: false, message: v.message || `Validation rule failed: ${expression}` }
}

/**
 * Evaluate a safe subset of expressions against a cell value.
 * Returns true/false for the expression result, or null if the expression
 * cannot be safely parsed (in which case validation passes).
 */
function evaluateSafeExpression(expr: string, rawValue: string | number | null, numVal: number): boolean | null {
  // Patterns: "value > 0", "value >= 100", "value < 1000", "value !== 0", "value == 5"
  const singleCompare = /^value\s*(>|>=|<|<=|===?|!==?)\s*(-?\d+(?:\.\d+)?)$/.exec(expr)
  if (singleCompare) {
    if (isNaN(numVal)) return false
    const op = singleCompare[1]
    const target = parseFloat(singleCompare[2])
    return compareOp(numVal, op, target)
  }

  // Patterns: "value >= X && value <= Y" (between)
  const betweenMatch = /^value\s*(>=?)\s*(-?\d+(?:\.\d+)?)\s*&&\s*value\s*(<=?)\s*(-?\d+(?:\.\d+)?)$/.exec(expr)
  if (betweenMatch) {
    if (isNaN(numVal)) return false
    const left = compareOp(numVal, betweenMatch[1], parseFloat(betweenMatch[2]))
    const right = compareOp(numVal, betweenMatch[3], parseFloat(betweenMatch[4]))
    return left && right
  }

  // Patterns: "value.length > 5" (text length)
  const lengthMatch = /^value\.length\s*(>|>=|<|<=|===?|!==?)\s*(\d+)$/.exec(expr)
  if (lengthMatch) {
    const strLen = String(rawValue ?? '').length
    return compareOp(strLen, lengthMatch[1], parseInt(lengthMatch[2]))
  }

  // Cannot safely parse — allow the value
  return null
}

function compareOp(left: number, op: string, right: number): boolean {
  switch (op) {
    case '>': return left > right
    case '>=': return left >= right
    case '<': return left < right
    case '<=': return left <= right
    case '==': case '===': return left === right
    case '!=': case '!==': return left !== right
    default: return true
  }
}

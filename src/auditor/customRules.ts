/**
 * Spreadsheet Auditor — Custom User Rules
 *
 * Form-based, domain-specific audit rules defined by users (no code required).
 * Rules are persisted to localStorage and run alongside the built-in rules via
 * runAudit's optional third argument.
 */

import type { Severity, AuditRule, AuditFinding, AuditContext, CellInfo } from './types'
import { findingId, letterToCol } from './utils'

export type NumericRuleOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'
export type TextRuleOperator = 'contains' | 'notContains'
export type EmptyRuleOperator = 'isEmpty' | 'isNotEmpty'
export type CustomRuleOperator = NumericRuleOperator | TextRuleOperator | EmptyRuleOperator

export interface CustomAuditRule {
  id: string
  name: string
  /** Column letter, e.g. "B" */
  column: string
  operator: CustomRuleOperator
  /** Threshold — ignored for isEmpty/isNotEmpty */
  value: string | number
  severity: Severity
  enabled: boolean
}

const STORAGE_KEY = 'smartsht-audit-rules'

export const OPERATOR_LABELS: Record<CustomRuleOperator, string> = {
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  eq: '=',
  neq: '≠',
  contains: 'contains',
  notContains: 'does not contain',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
}

export function loadCustomRules(): CustomAuditRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidCustomRule) : []
  } catch {
    return []
  }
}

const VALID_SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const VALID_OPERATORS: readonly CustomRuleOperator[] = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'contains', 'notContains', 'isEmpty', 'isNotEmpty']

/** True if the parsed value is a well-formed custom audit rule. */
function isValidCustomRule(r: unknown): r is CustomAuditRule {
  if (typeof r !== 'object' || r === null) return false
  const rule = r as Record<string, unknown>
  return (
    typeof rule.id === 'string' &&
    typeof rule.name === 'string' &&
    typeof rule.column === 'string' &&
    typeof rule.enabled === 'boolean' &&
    VALID_SEVERITIES.includes(rule.severity as Severity) &&
    VALID_OPERATORS.includes(rule.operator as CustomRuleOperator) &&
    (typeof rule.value === 'string' || typeof rule.value === 'number')
  )
}

export function saveCustomRules(rules: CustomAuditRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {
    // storage unavailable — ignore
  }
}

function compareNumeric(op: NumericRuleOperator, num: number, threshold: number): boolean {
  switch (op) {
    case 'gt': return num > threshold
    case 'lt': return num < threshold
    case 'gte': return num >= threshold
    case 'lte': return num <= threshold
    case 'eq': return num === threshold
    default: return num !== threshold
  }
}

/** Numeric value of a cell, falling back to its computed value when rawValue is not numeric. */
function cellNumber(cell: CellInfo): number {
  const raw = cell.rawValue
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw !== '') {
    const parsed = parseFloat(raw)
    if (isFinite(parsed)) return parsed
  }
  // Plain cells: getComputedValue returns String(rawValue), so parsing
  // computedValue is equivalent to parsing rawValue.
  return parseFloat(cell.computedValue)
}

/** Visible text of a cell, falling back to its computed value when rawValue has no content. */
function cellText(cell: CellInfo): string {
  const raw = cell.rawValue
  return raw == null || raw === '' ? cell.computedValue.toLowerCase() : String(raw).toLowerCase()
}

/** True if the cell has no visible content (formula cells only count as empty when they compute nothing). */
function cellIsEmpty(cell: CellInfo): boolean {
  if (cell.rawValue !== null && cell.rawValue !== '') return false
  if (cell.formula) return cell.computedValue.trim() === ''
  return true
}

/** True if the cell satisfies the rule's condition. */
export function ruleMatches(rule: CustomAuditRule, cell: CellInfo): boolean {
  switch (rule.operator) {
    case 'contains': {
      const haystack = cellText(cell)
      if (haystack === '') return false
      return haystack.includes(String(rule.value).toLowerCase())
    }
    case 'notContains': {
      const haystack = cellText(cell)
      if (haystack === '') return false
      return !haystack.includes(String(rule.value).toLowerCase())
    }
    case 'isEmpty':
      return cellIsEmpty(cell)
    case 'isNotEmpty':
      return !cellIsEmpty(cell)
    default: {
      const num = cellNumber(cell)
      if (!isFinite(num)) return false
      const threshold = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value))
      if (!isFinite(threshold)) return false
      return compareNumeric(rule.operator, num, threshold)
    }
  }
}

/** Build an AuditRule wrapper that evaluates a custom rule against the sheet. */
export function createCustomAuditRule(rule: CustomAuditRule): AuditRule {
  return {
    id: `custom:${rule.id}`,
    name: rule.name,
    description: `Custom rule: ${rule.name}`,
    defaultSeverity: rule.severity,
    run(ctx: AuditContext): AuditFinding[] {
      const findings: AuditFinding[] = []
      if (!rule.enabled) return findings
      if (!/^[A-Za-z]{1,3}$/.test(rule.column)) return findings
      const col = letterToCol(rule.column)
      if (col < 0) return findings

      for (const cell of ctx.getColumn(col)) {
        if (!ruleMatches(rule, cell)) continue
        const label = OPERATOR_LABELS[rule.operator]
        const hasValue = rule.operator !== 'isEmpty' && rule.operator !== 'isNotEmpty'
        const valueText = hasValue ? ` ${String(rule.value)}` : ''
        findings.push({
          id: findingId(),
          ruleId: `custom:${rule.id}`,
          severity: rule.severity,
          title: rule.name,
          message: `${cell.cellId}: ${rule.column} ${label}${valueText}`,
          cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
          suggestion: rule.operator === 'isEmpty' || rule.operator === 'isNotEmpty'
            ? `${rule.name}: ${rule.column} ${label}`
            : `${rule.name}: ${rule.column} must be ${label}${valueText}`,
          autoFixable: false,
        })
      }
      return findings
    },
  }
}

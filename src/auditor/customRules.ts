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
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
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

/** True if the cell satisfies the rule's condition. */
export function ruleMatches(rule: CustomAuditRule, cell: CellInfo): boolean {
  switch (rule.operator) {
    case 'contains': {
      const haystack = cell.rawValue == null || cell.rawValue === '' ? '' : String(cell.rawValue).toLowerCase()
      if (haystack === '') return false
      return haystack.includes(String(rule.value).toLowerCase())
    }
    case 'notContains': {
      if (typeof cell.rawValue !== 'string') return false
      const haystack = cell.rawValue.toLowerCase()
      if (haystack === '') return false
      return !haystack.includes(String(rule.value).toLowerCase())
    }
    case 'isEmpty':
      return cell.rawValue === null || cell.rawValue === ''
    case 'isNotEmpty':
      return cell.rawValue !== null && cell.rawValue !== ''
    default: {
      const num = typeof cell.rawValue === 'number' ? cell.rawValue : parseFloat(String(cell.rawValue))
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

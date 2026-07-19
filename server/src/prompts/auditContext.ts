/**
 * Formats audit findings for injection into the system prompt.
 *
 * NOTE: In this project, audit data flows from the frontend via the
 * `deterministicSummary` field in SpreadsheetContextInput. The frontend
 * runs the auditor locally (src/auditor/index.ts → formatAuditForContext)
 * and includes the results in the context payload.
 *
 * This module provides a server-side formatter for cases where audit data
 * is sent as a separate structured payload (future API enhancement).
 */

export interface AuditFindingSummary {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  message: string
  location?: string
  suggestion?: string
  autoFixable?: boolean
}

export interface AuditSummary {
  score: number
  totalFindings: number
  findings: AuditFindingSummary[]
  ranAt?: number
}

/**
 * Builds a text block describing audit results for injection into the system prompt.
 * Returns empty string if no audit data or no significant findings.
 */
export function buildAuditContext(audit: AuditSummary | null | undefined): string {
  if (!audit) return ''
  if (audit.totalFindings === 0) return ''

  const bySeverity = {
    critical: audit.findings.filter((f) => f.severity === 'critical'),
    high: audit.findings.filter((f) => f.severity === 'high'),
    medium: audit.findings.filter((f) => f.severity === 'medium'),
    low: audit.findings.filter((f) => f.severity === 'low'),
    info: audit.findings.filter((f) => f.severity === 'info'),
  }

  const significant = [...bySeverity.critical, ...bySeverity.high]
  if (significant.length === 0 && bySeverity.medium.length === 0) return ''

  const lines: string[] = [
    `Spreadsheet audit (score ${audit.score}/100, ${audit.totalFindings} issues):`,
  ]

  if (bySeverity.critical.length > 0) {
    lines.push(`  CRITICAL (${bySeverity.critical.length}):`)
    bySeverity.critical.slice(0, 4).forEach((f) => {
      lines.push(`    • ${f.title}${f.location ? ` at ${f.location}` : ''}: ${f.suggestion ?? f.message}${f.autoFixable ? ' [auto-fixable]' : ''}`)
    })
  }

  if (bySeverity.high.length > 0) {
    lines.push(`  HIGH (${bySeverity.high.length}):`)
    bySeverity.high.slice(0, 4).forEach((f) => {
      lines.push(`    • ${f.title}${f.location ? ` at ${f.location}` : ''}: ${f.suggestion ?? f.message}${f.autoFixable ? ' [auto-fixable]' : ''}`)
    })
  }

  if (bySeverity.medium.length > 0) {
    lines.push(`  MEDIUM (${bySeverity.medium.length}):`)
    bySeverity.medium.slice(0, 3).forEach((f) => {
      lines.push(`    • ${f.title}: ${f.suggestion ?? f.message}`)
    })
  }

  const remaining = bySeverity.low.length + bySeverity.info.length
  if (remaining > 0) {
    lines.push(`  + ${remaining} low/info findings (not shown)`)
  }

  lines.push('')
  lines.push('When discussing audit findings: lead with critical issues, give specific cell locations, give specific fixes (not just "fix the formula"), and mention auto-fixable items prominently.')

  return lines.join('\n')
}

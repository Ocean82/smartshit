/**
 * Spreadsheet Auditor — Main Engine
 *
 * Runs all audit rules against a sheet's cell data and returns a structured
 * result with findings, a health score, and a human-readable summary.
 *
 * This runs entirely client-side using data already in the Zustand store.
 * No server calls, no file uploads, no Python.
 */

import type { SheetData } from '@/types'
import type { AuditResult, AuditContext, AuditFinding, CellInfo, Severity } from './types'
import { ALL_RULES } from './rules'
import { refToCell, cellToRef, classifyCellType, isErrorValue, getErrorType } from './utils'

export type { AuditResult, AuditFinding, CellInfo, Severity } from './types'
export type { CellLocation, AuditRule, AuditContext } from './types'

/**
 * Run a full audit on a sheet.
 *
 * @param sheet - The sheet data from the Zustand store.
 * @param getComputedValue - Function to get HyperFormula-computed value for a cell.
 * @returns Structured audit result with findings and score.
 */
export function runAudit(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): AuditResult {
  const startTime = performance.now()

  // Build cell info list from the sheet's cell map
  const allCells: CellInfo[] = []
  const formulaCells: CellInfo[] = []
  const cellMap = new Map<string, CellInfo>()

  let maxRow = 0
  let maxCol = 0

  for (const [cellId, cellData] of Object.entries(sheet.cells)) {
    if (cellData.value === null && !cellData.formula) continue

    const ref = cellToRef(cellId)
    const computedValue = getComputedValue(ref.row, ref.col)
    const formula = cellData.formula
      ? (cellData.formula.startsWith('=') ? cellData.formula.slice(1) : cellData.formula)
      : null
    const type = classifyCellType(cellData.value, formula, computedValue)

    const info: CellInfo = {
      cellId,
      row: ref.row,
      col: ref.col,
      rawValue: cellData.value,
      formula,
      computedValue,
      type,
      errorType: isErrorValue(computedValue) ? getErrorType(computedValue) : undefined,
    }

    allCells.push(info)
    cellMap.set(cellId, info)

    if (formula) formulaCells.push(info)
    if (ref.row > maxRow) maxRow = ref.row
    if (ref.col > maxCol) maxCol = ref.col
  }

  // Build the audit context
  const ctx: AuditContext = {
    sheetName: sheet.name,
    allCells,
    formulaCells,
    maxRow,
    maxCol,

    getCellAt(row: number, col: number): CellInfo | null {
      const id = refToCell(row, col)
      return cellMap.get(id) ?? null
    },

    getColumn(col: number): CellInfo[] {
      return allCells.filter((c) => c.col === col)
    },

    getRow(row: number): CellInfo[] {
      return allCells.filter((c) => c.row === row)
    },
  }

  // Execute all rules, catching errors so one bad rule doesn't crash the audit
  const findings: AuditFinding[] = []
  for (const rule of ALL_RULES) {
    try {
      const ruleFindings = rule.run(ctx)
      findings.push(...ruleFindings)
    } catch (err) {
      console.warn(`Audit rule "${rule.id}" failed:`, err)
    }
  }

  // Sort by severity
  const severityOrder: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  }
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // Calculate health score (100 = perfect, 0 = catastrophic)
  const weights: Record<Severity, number> = {
    critical: 20,
    high: 10,
    medium: 5,
    low: 2,
    info: 0,
  }
  const totalPenalty = findings.reduce((sum, f) => sum + weights[f.severity], 0)
  const score = Math.max(0, Math.min(100, 100 - totalPenalty))

  // Generate summary
  const durationMs = Math.round(performance.now() - startTime)
  const critCount = findings.filter((f) => f.severity === 'critical').length
  const highCount = findings.filter((f) => f.severity === 'high').length

  let summary: string
  if (findings.length === 0) {
    summary = 'No issues found. Your spreadsheet looks clean. ✅'
  } else if (critCount > 0) {
    summary = `Found ${findings.length} issue${findings.length > 1 ? 's' : ''} including ${critCount} critical. Immediate attention recommended. 🔴`
  } else if (highCount > 0) {
    summary = `Found ${findings.length} issue${findings.length > 1 ? 's' : ''} including ${highCount} high priority. Review recommended. 🟠`
  } else {
    summary = `Found ${findings.length} minor issue${findings.length > 1 ? 's' : ''}. Overall health is good. 🟡`
  }

  return {
    timestamp: Date.now(),
    durationMs,
    sheetName: sheet.name,
    totalCells: allCells.length,
    formulaCells: formulaCells.length,
    findings,
    score,
    summary,
  }
}

/**
 * Format audit findings for inclusion in LLM context.
 * Returns a concise string summarizing critical/high findings
 * that the AI can reference when explaining the spreadsheet.
 */
export function formatAuditForContext(result: AuditResult): string {
  if (result.findings.length === 0) return ''

  const significant = result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high')
  if (significant.length === 0) return ''

  const lines = [
    `Spreadsheet audit (score ${result.score}/100):`,
    ...significant.slice(0, 8).map((f) => `  • [${f.severity.toUpperCase()}] ${f.title}: ${f.suggestion ?? f.message}`),
  ]

  if (significant.length > 8) {
    lines.push(`  … and ${significant.length - 8} more issues.`)
  }

  return lines.join('\n')
}

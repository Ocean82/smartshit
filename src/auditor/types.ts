/**
 * Spreadsheet Auditor — Type definitions.
 *
 * All audit findings are typed here. The auditor is read-only:
 * it reports defects but never modifies the workbook.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface CellLocation {
  /** Cell ID in "A1" notation */
  cellId: string
  row: number
  col: number
}

export interface AuditFinding {
  id: string
  ruleId: string
  severity: Severity
  title: string
  message: string
  cells: CellLocation[]
  suggestion?: string
  /** Whether this finding can be auto-fixed */
  autoFixable: boolean
  /** Fix descriptor: formula to set on the target cell */
  fixAction?: { cellId: string; formula?: string; value?: string | number | null }
}

export interface AuditResult {
  timestamp: number
  durationMs: number
  sheetName: string
  totalCells: number
  formulaCells: number
  findings: AuditFinding[]
  /** 0–100 health score (100 = no issues) */
  score: number
  summary: string
}

export interface AuditRule {
  id: string
  name: string
  description: string
  defaultSeverity: Severity
  run: (ctx: AuditContext) => AuditFinding[]
}

export interface CellInfo {
  cellId: string
  row: number
  col: number
  rawValue: string | number | boolean | null
  formula: string | null
  computedValue: string
  type: 'formula' | 'number' | 'string' | 'boolean' | 'empty' | 'error'
  errorType?: string
}

export interface AuditContext {
  sheetName: string
  allCells: CellInfo[]
  formulaCells: CellInfo[]
  /** Get a cell by row/col. Returns null if empty or out of bounds. */
  getCellAt: (row: number, col: number) => CellInfo | null
  /** Get all non-empty cells in a column. */
  getColumn: (col: number) => CellInfo[]
  /** Get all non-empty cells in a row. */
  getRow: (row: number) => CellInfo[]
  /** Max populated row index */
  maxRow: number
  /** Max populated col index */
  maxCol: number
}

/**
 * Spreadsheet Auditor — Type definitions.
 *
 * All audit findings are typed here. Running an audit never modifies the
 * workbook; fixes are proposed as `fixActions` and applied only after the
 * user reviews and accepts them.
 */

import type { SheetData } from '@/types'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface CellLocation {
  /** Cell ID in "A1" notation */
  cellId: string
  row: number
  col: number
}

export interface FixWrite {
  cellId: string
  formula?: string
  value?: string | number | null
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
  /** Fix writes: set formula/value on each target cell, in order */
  fixActions?: FixWrite[]
}

export interface AuditResult {
  timestamp: number
  durationMs: number
  sheetId: string
  sheetName: string
  totalCells: number
  formulaCells: number
  findings: AuditFinding[]
  /** Findings the user dismissed. Excluded from `findings`, `score` and `summary`. */
  dismissed?: AuditFinding[]
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

export interface DismissedFindingEntry {
  cellIds: string[]
  dismissedAt: number
  /** Snapshot of cell values at dismissal time, keyed by cellId */
  valueSnapshot?: Record<string, string | number | boolean | null>
}

/** The sheets of the workbook being audited, for rules that follow references across sheets. */
export interface AuditWorkbook {
  sheets: ReadonlyArray<Pick<SheetData, 'id' | 'name' | 'cells'>>
}

export interface AuditContext {
  sheetName: string
  /** Present when the caller passed the workbook; rules fall back to single-sheet behaviour without it. */
  workbook?: AuditWorkbook
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

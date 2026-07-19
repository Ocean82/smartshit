/**
 * Builds the live spreadsheet state block for the system prompt.
 *
 * CURRENT STATUS: The primary context builder is `formatContextBlock` in
 * ../prompt.ts — it handles all the rich context assembly (sheet summaries,
 * profiles, insights, sample rows, deterministic summaries, etc.).
 *
 * This module provides a lightweight alternative for scenarios where the
 * full SpreadsheetContextInput is unavailable (e.g., health/status queries,
 * minimal-context endpoints, or a future mobile client with limited state).
 *
 * To activate: use buildMinimalSpreadsheetContext() in any endpoint that
 * receives a SpreadsheetSnapshot instead of the full context payload.
 */

export interface SpreadsheetSnapshot {
  totalCells: number
  formulaCells: number
  sheets: string[]
  activeSheet: string
  selectedCell?: string
  selectedFormula?: string
  dataRange?: string
  sampleData?: string
}

/**
 * Builds a minimal spreadsheet state summary.
 * Used only when the full SpreadsheetContextInput is not available
 * (e.g., for lightweight health/status queries).
 */
export function buildMinimalSpreadsheetContext(
  snapshot: SpreadsheetSnapshot,
): string {
  if (snapshot.totalCells === 0) {
    return '\nThe spreadsheet is empty. No data has been entered yet.'
  }

  const lines: string[] = [
    `Active sheet: "${snapshot.activeSheet}"`,
    `Sheets: ${snapshot.sheets.join(', ')}`,
    `Cells with data: ${snapshot.totalCells.toLocaleString()}`,
    `Formula cells: ${snapshot.formulaCells.toLocaleString()}`,
  ]

  if (snapshot.dataRange) {
    lines.push(`Data range: ${snapshot.dataRange}`)
  }

  if (snapshot.selectedCell) {
    lines.push(`Selected: ${snapshot.selectedCell}`)
    if (snapshot.selectedFormula) {
      lines.push(`Formula: \`=${snapshot.selectedFormula}\``)
    }
  }

  if (snapshot.sampleData) {
    lines.push(`Sample:\n${snapshot.sampleData}`)
  }

  return lines.join('\n')
}

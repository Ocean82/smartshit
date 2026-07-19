/**
 * Builds the live spreadsheet state block for the system prompt.
 *
 * This is a thin re-export/adapter — the heavy lifting is done by
 * `formatContextBlock` in prompt.ts which already handles all the
 * rich context assembly (sheet summaries, profiles, insights, etc.).
 *
 * This module exists to complete the modular architecture described in
 * docs/chat-prompt/chat.md and to provide typed interfaces for the
 * spreadsheet snapshot concept.
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

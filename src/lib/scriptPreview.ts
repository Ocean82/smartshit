/**
 * Script preview builder — runs an agent-generated `execute_script` in
 * collect-only (dry-run) mode and converts the collected mutations into a
 * user-facing `CellChange[]` preview.
 *
 * This is the approval safety net for the sandbox: the user sees exactly what
 * the script would change (cell values, formats, row operations) before the
 * action is applied. The script is executed in the isolated QuickJS VM and
 * NEVER mutates the sheet here — it only collects what would change.
 */

import { runScript } from '@/sandbox'
import type { SheetData, CellChange, CellFormat } from '@/types'
import type { SandboxSuccess } from '@/sandbox'

export interface ScriptPreviewContext {
  sheet: SheetData
  getComputedValue: (row: number, col: number) => string
}

export interface ScriptPreviewResult {
  success: boolean
  error?: string
  changes?: CellChange[]
}

/** Read the current raw value of a cell from the sheet. */
function readCellRaw(
  sheet: SheetData,
  cellId: string,
): { value: string | number | boolean | null; formula?: string } {
  const cell = sheet.cells[cellId]
  return { value: cell?.value ?? null, formula: cell?.formula }
}

/** Render a format patch as a short human-readable note. */
function describeFormat(format: Partial<CellFormat>): string {
  const parts: string[] = []
  if (format.bold != null) parts.push(`bold=${format.bold}`)
  if (format.italic != null) parts.push(`italic=${format.italic}`)
  if (format.underline != null) parts.push(`underline=${format.underline}`)
  if (format.fontSize != null) parts.push(`fontSize=${format.fontSize}`)
  if (format.fontColor != null) parts.push(`fontColor=${format.fontColor}`)
  if (format.bgColor != null) parts.push(`bgColor=${format.bgColor}`)
  if (format.textAlign != null) parts.push(`align=${format.textAlign}`)
  if (format.numberFormat != null) parts.push(`numberFormat=${format.numberFormat}`)
  return parts.length > 0 ? parts.join(', ') : 'formatting'
}

/**
 * Build a `CellChange[]` preview from a successful dry-run execution.
 * Does not touch the store — purely descriptive.
 */
export function mutationsToPreview(
  result: Extract<SandboxSuccess, { success: true }>,
  sheet: SheetData,
): CellChange[] {
  const changes: CellChange[] = []

  for (const [cellId, update] of Object.entries(result.cellUpdates)) {
    const current = readCellRaw(sheet, cellId)
    changes.push({
      cell: cellId,
      oldValue: current.value,
      newValue: update.formula != null ? null : (update.value ?? null),
      oldFormula: current.formula,
      newFormula: update.formula,
    })
  }

  for (const [cellId, format] of Object.entries(result.formatUpdates)) {
    changes.push({
      cell: cellId,
      oldValue: readCellRaw(sheet, cellId).value,
      newValue: null,
      description: `format: ${describeFormat(format as Partial<CellFormat>)}`,
    })
  }

  for (const afterRow of result.rowInsertions) {
    changes.push({
      cell: `Row ${afterRow + 1}`,
      oldValue: null,
      newValue: null,
      description: `insert row`,
    })
  }

  for (const row of result.rowDeletions) {
    changes.push({
      cell: `Row ${row + 1}`,
      oldValue: null,
      newValue: null,
      description: `delete row`,
    })
  }

  return changes
}

/**
 * Run a script in collect-only mode and return a preview of what it would
 * change. Returns `success: false` with the error if the script fails to run
 * (so the caller can surface that instead of attaching a broken preview).
 */
export async function buildScriptPreview(
  code: string,
  ctx: ScriptPreviewContext,
): Promise<ScriptPreviewResult> {
  const result = await runScript(code, {
    sheet: ctx.sheet,
    getComputedValue: ctx.getComputedValue,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const changes = mutationsToPreview(result, ctx.sheet)
  return { success: true, changes }
}

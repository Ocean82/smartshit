import { buildSpreadsheetContext, type SpreadsheetContextPayload } from '@/ai/buildContext'
import { refToCell } from '@/engine/spreadsheet'
import type { AttachedFilePreview } from '@/ai/types'
import type { Selection, SheetData, WorkbookData } from '@/types'

export interface AnalysisTarget {
  sheet: SheetData
  workbookName: string
  getComputedValue: (row: number, col: number) => string
  context: SpreadsheetContextPayload
  isAttached: boolean
}

function getAttachedComputedValue(workbook: WorkbookData, row: number, col: number): string {
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0]
  const cellId = refToCell(row, col)
  const val = sheet.cells[cellId]?.value
  return val === null || val === undefined ? '' : String(val)
}

function mergeContext(
  base: SpreadsheetContextPayload,
  attachedPreview?: AttachedFilePreview | null,
): SpreadsheetContextPayload {
  if (!attachedPreview) return base
  return {
    ...attachedPreview.context,
    workbookName: `${base.workbookName} (attached: ${attachedPreview.fileName})`,
    selectedCells: base.selectedCells.length ? base.selectedCells : attachedPreview.context.selectedCells,
    selectionSnapshot: Object.keys(base.selectionSnapshot).length
      ? base.selectionSnapshot
      : attachedPreview.context.selectionSnapshot,
  }
}

export function resolveAnalysisTarget(input: {
  workbook: WorkbookData
  sheet: SheetData
  selection: Selection | null
  getComputedValue: (row: number, col: number) => string
  attachedPreview?: AttachedFilePreview | null
}): AnalysisTarget {
  const baseContext = buildSpreadsheetContext(
    input.workbook,
    input.sheet,
    input.selection,
    input.getComputedValue,
  )

  if (input.attachedPreview) {
    const attachedWorkbook = input.attachedPreview.workbook
    const attachedSheet = attachedWorkbook.sheets.find((s) => s.id === attachedWorkbook.activeSheetId)
      ?? attachedWorkbook.sheets[0]
    const getAttachedValue = (row: number, col: number) => getAttachedComputedValue(attachedWorkbook, row, col)

    return {
      sheet: attachedSheet,
      workbookName: input.attachedPreview.fileName,
      getComputedValue: getAttachedValue,
      context: mergeContext(baseContext, input.attachedPreview),
      isAttached: true,
    }
  }

  return {
    sheet: input.sheet,
    workbookName: input.workbook.name,
    getComputedValue: input.getComputedValue,
    context: baseContext,
    isAttached: false,
  }
}

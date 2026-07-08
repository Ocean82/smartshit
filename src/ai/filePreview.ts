import { importWorkbookFromFileWithMeta } from '@/io/xlsx'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import type { AttachedFilePreview } from '@/ai/types'
import type { WorkbookData } from '@/types'

export async function buildFilePreview(
  file: File,
  getComputedValueForWorkbook: (workbook: WorkbookData, row: number, col: number) => string,
): Promise<AttachedFilePreview> {
  const { workbook, meta } = await importWorkbookFromFileWithMeta(file)
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0]
  const context = buildSpreadsheetContext(
    workbook,
    sheet,
    null,
    (row, col) => getComputedValueForWorkbook(workbook, row, col),
  )

  return { fileName: file.name, workbook, context, importWarnings: meta.warnings }
}

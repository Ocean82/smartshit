import type { WorkbookData, SheetData } from '@/types'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

const PACKAGE_TYPE = 'smartsht-workbook' as const

export interface WorkbookJsonPackage {
  version: 1
  type: typeof PACKAGE_TYPE
  exportedAt: number
  workbook: WorkbookData
}

function isSheetData(value: unknown): value is SheetData {
  if (!value || typeof value !== 'object') return false
  const s = value as SheetData
  return typeof s.id === 'string'
    && typeof s.name === 'string'
    && typeof s.cells === 'object'
    && s.cells != null
}

function isWorkbookData(value: unknown): value is WorkbookData {
  if (!value || typeof value !== 'object') return false
  const w = value as WorkbookData
  return typeof w.id === 'string'
    && typeof w.name === 'string'
    && typeof w.activeSheetId === 'string'
    && Array.isArray(w.sheets)
    && w.sheets.length > 0
    && w.sheets.every(isSheetData)
}

export function serializeWorkbookPackage(workbook: WorkbookData): WorkbookJsonPackage {
  return {
    version: 1,
    type: PACKAGE_TYPE,
    exportedAt: Date.now(),
    workbook: structuredClone(workbook),
  }
}

export function parseWorkbookJson(raw: string): WorkbookData {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON file')
  }

  // Accept either wrapped package or bare WorkbookData
  if (parsed && typeof parsed === 'object' && (parsed as WorkbookJsonPackage).type === PACKAGE_TYPE) {
    const pkg = parsed as WorkbookJsonPackage
    if (pkg.version !== 1 || !isWorkbookData(pkg.workbook)) {
      throw new Error('Unrecognized smartsht workbook backup format')
    }
    return pkg.workbook
  }

  if (isWorkbookData(parsed)) return parsed
  throw new Error('File is not a smartsht workbook backup')
}

export function exportWorkbookToJson(workbook: WorkbookData, filename?: string): void {
  const pkg = serializeWorkbookPackage(workbook)
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename || workbook.name || 'workbook'}.smartsht.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importWorkbookFromJsonFile(file: File): Promise<WorkbookData> {
  const text = await file.text()
  return parseWorkbookJson(text)
}

/** Soft-validate after import; fills missing arrays so the engine can load. */
export function normalizeImportedWorkbook(workbook: WorkbookData): WorkbookData {
  const fallback = createEmptyWorkbook(workbook.name || 'Imported')
  return {
    ...fallback,
    ...workbook,
    sheets: workbook.sheets.map((sheet) => ({
      ...sheet,
      cells: sheet.cells ?? {},
      columnWidths: sheet.columnWidths ?? {},
      rowHeights: sheet.rowHeights ?? {},
      charts: sheet.charts ?? [],
    })),
    updatedAt: Date.now(),
  }
}

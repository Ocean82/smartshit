/**
 * Post-import UI/chat/audit orchestration.
 * Kept out of workbookSlice so data load stays free of chat/panel side effects.
 */

import type { WorkbookData, ChatMessage } from '@/types'
import { cellToRef } from '@/engine/spreadsheet'
import { runAudit } from '@/auditor'
import { v4 as uuid } from 'uuid'

export interface ImportEffectAccess {
  workbook: WorkbookData
  activeSheetId: string
  messages: ChatMessage[]
  activePanel: 'chat' | 'insights' | 'auditor' | 'inspector' | null
  lastAuditResult: import('@/auditor/types').AuditResult | null
  getActiveSheet: () => WorkbookData['sheets'][number]
  getComputedValue: (row: number, col: number) => string
}

export interface ImportSheetSummary {
  name: string
  rows: number
}

/** Compute per-sheet row counts used by import messaging / insights gating. */
export function summarizeImportedSheets(workbook: WorkbookData): ImportSheetSummary[] {
  return workbook.sheets.map((s) => {
    const keys = Object.keys(s.cells)
    const rows = keys.length === 0
      ? 0
      : Math.max(...keys.map((id) => cellToRef(id).row)) + 1
    return { name: s.name, rows }
  })
}

/**
 * Chat welcome, insights panel open, and background audit after a workbook import.
 * Call after the workbook data has already been loaded into the store.
 */
export function applyWorkbookImportEffects(
  set: (fn: (s: ImportEffectAccess) => void) => void,
  get: () => ImportEffectAccess,
  workbook: WorkbookData,
  meta?: { fileName?: string },
): void {
  const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0]
  const sheetLines = summarizeImportedSheets(workbook)
  const activeRows = sheetLines.find((s) => s.name === sheet?.name)?.rows ?? 0
  const fileLabel = meta?.fileName ?? 'your file'
  const multi = workbook.sheets.length > 1
  const sheetList = sheetLines
    .map((s) => `**${s.name}** (${s.rows} row${s.rows === 1 ? '' : 's'})`)
    .join(', ')
  const importMessage = multi
    ? `Imported **${fileLabel}** with **${workbook.sheets.length} sheets**: ${sheetList}.\n\nYou're on **${sheet?.name ?? 'Sheet1'}**. Use the sheet tabs at the bottom to switch — I analyze the active sheet.`
    : `Imported **${fileLabel}** — ${activeRows} rows on **${sheet?.name ?? 'Sheet 1'}**. Ready to analyze.\n\nAsk me anything about this data — try *"Explain this spreadsheet"* or *"Where am I overspending?"*`

  set((s) => {
    s.messages.push({
      id: uuid(),
      role: 'assistant',
      content: importMessage,
      timestamp: Date.now(),
      suggestions: multi
        ? sheetLines.slice(0, 4).map((line) => `Explain the "${line.name}" sheet`)
        : undefined,
    })
  })

  if (activeRows > 5) {
    set((s) => { s.activePanel = 'insights' })

    setTimeout(() => {
      try {
        const activeSheet = get().getActiveSheet()
        if (Object.keys(activeSheet.cells).length > 4) {
          const auditResult = runAudit(activeSheet, get().getComputedValue)
          set((s) => { s.lastAuditResult = auditResult })
        }
      } catch {
        // Audit failure is non-fatal
      }
    }, 500)
  }
}

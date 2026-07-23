/**
 * Chat Service — orchestrates the full message flow for the AI chat.
 *
 * Extracted from the monolithic useStore to:
 * 1. Make the logic testable in isolation
 * 2. Decouple AI orchestration from Zustand state management
 * 3. Enable future multi-provider or streaming strategies
 *
 * The service receives thin callbacks for state mutations rather than
 * depending on the store directly. This allows tests to verify behavior
 * without spinning up the full Zustand store.
 */

import type { ChatMessage, SheetData, Selection, WorkbookData } from '@/types'
import type { ExecutionContext } from '@/agent/executor'
import { parseMessage, executeTool } from '@/agent'
import { executeTemplateTool, resolveGalleryTemplate } from '@/templates'
import { processMessage } from '@/ai/brain'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { toolResultToChatMessage, toolResultToMessage } from '@/ai/responseBuilder'
import { classifyMode, isLlmOnlyMode } from '@/ai/mode'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { cellToRef } from '@/engine/spreadsheet'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { AttachedFilePreview } from '@/ai/types'
import { v4 as uuid } from 'uuid'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatServiceDeps {
  /** Get the current workbook */
  getWorkbook: () => WorkbookData
  /** Get the active sheet */
  getActiveSheet: () => SheetData
  /** Get computed cell value */
  getComputedValue: (row: number, col: number) => string
  /** Get the current selection */
  getSelection: () => Selection | null
  /** Get the active sheet ID */
  getActiveSheetId: () => string
  /** Get the attached file preview */
  getAttachedPreview: () => AttachedFilePreview | null
  /** Get the chat messages for history */
  getMessages: () => ChatMessage[]
  /** Switch to a different sheet */
  setActiveSheet: (sheetId: string) => void
  /** Push a history snapshot for undo */
  pushHistory: (desc: string) => void
  /** Build an execution context for running tools */
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  /** Update the streaming message with a token */
  appendToken: (msgId: string, token: string) => void
  /** Finalize a message (replace the streaming placeholder) */
  finalizeMessage: (msgId: string, msg: ChatMessage) => void
  /** Set processing state */
  setProcessing: (v: boolean) => void
  /** Fallback handler for when LLM fails */
  processLocalFallback: (input: string) => ChatMessage
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Process a user chat message through the full AI pipeline:
 * 1. @-mention sheet switching
 * 2. Local parser (instant, no LLM)
 * 3. Gallery template matching
 * 4. LLM server for complex queries
 * 5. Local fallback if server fails
 */
export async function processChatMessage(
  input: string,
  streamingMsgId: string,
  deps: ChatServiceDeps,
): Promise<void> {
  const {
    getWorkbook,
    getActiveSheet,
    getComputedValue,
    getSelection,
    getActiveSheetId,
    getAttachedPreview,
    getMessages,
    setActiveSheet,
    pushHistory,
    buildExecContext,
    appendToken,
    finalizeMessage,
    setProcessing,
    processLocalFallback,
  } = deps

  try {
    // ─── @-mention sheet switching ─────────────────────────────────────────
    const sheetMention = input.match(/@([A-Za-z0-9_ -]+)/)
    if (sheetMention) {
      const mentionedName = sheetMention[1].trim()
      const workbook = getWorkbook()
      const targetSheet = workbook.sheets.find(
        (s) => s.name.toLowerCase() === mentionedName.toLowerCase()
      )
      if (targetSheet && targetSheet.id !== getActiveSheetId()) {
        setActiveSheet(targetSheet.id)
      }
    }

    const sheet = getActiveSheet()
    const messages = getMessages()
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -2)
      .slice(-12)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const priorInsights = messages
      .filter((m) => m.role === 'assistant' && m.insightsSnapshot)
      .at(-1)?.insightsSnapshot as SheetInsights | undefined

    const context = buildSpreadsheetContext(
      getWorkbook(),
      sheet,
      getSelection(),
      getComputedValue,
    )

    // ─── Agent Parser (instant, no LLM) ──────────────────────────────────
    const headerRowIdx = findHeaderRow(sheet)
    const lastDataRowIdx = findLastDataRow(sheet)
    let lastDataColIdx = 0
    const headers: string[] = []
    for (const cellId of Object.keys(sheet.cells)) {
      lastDataColIdx = Math.max(lastDataColIdx, cellToRef(cellId).col)
    }
    for (let c = 0; c <= lastDataColIdx; c++) {
      headers.push(getComputedValue(headerRowIdx, c))
    }

    const parsed = parseMessage(input, {
      headerRow: headerRowIdx,
      lastDataRow: lastDataRowIdx,
      lastDataCol: lastDataColIdx,
      headers,
    })

    if (parsed.understood && parsed.calls.length > 0) {
      pushHistory(`AI: ${parsed.explanation || parsed.calls.map((c) => c.description).join(', ')}`)
      const execCtx = buildExecContext({ suppressHistory: true })
      const results = parsed.calls.map((call) => executeTool(call, execCtx))
      const allSuccess = results.every((r) => r.success)
      const totalModified = results.reduce((sum, r) => sum + r.modified, 0)

      const resultMessages = results.map((r) => r.message)
      const explanation = parsed.explanation || resultMessages.join('. ')
      const responseText = allSuccess
        ? `✓ ${explanation}${totalModified > 0 ? ` (${totalModified} cell${totalModified === 1 ? '' : 's'} modified)` : ''}`
        : `⚠️ ${resultMessages.join('. ')}`

      finalizeMessage(streamingMsgId, {
        id: streamingMsgId,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
      })
      setProcessing(false)
      return
    }

    // ─── Gallery template prompt (instant build, no LLM) ─────────────────
    const galleryMatch = resolveGalleryTemplate(input)
    if (galleryMatch) {
      pushHistory(`Template: ${galleryMatch.label}`)
      const execCtx = buildExecContext({ suppressHistory: true })
      const result = executeTemplateTool(galleryMatch.tool, {}, execCtx)
      const responseText = result.success
        ? `✓ ${result.message}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} filled)` : ''}`
        : `⚠️ ${result.message}`

      finalizeMessage(streamingMsgId, {
        id: streamingMsgId,
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
      })
      setProcessing(false)
      return
    }

    // ─── LLM Path (server-side AI for complex/open-ended requests) ───────
    const result = await processMessage({
      message: input,
      workbook: getWorkbook(),
      sheet,
      selection: getSelection(),
      getComputedValue,
      attachedPreview: getAttachedPreview(),
      priorInsights: priorInsights ?? null,
      history,
      onToken: (token) => {
        appendToken(streamingMsgId, token)
      },
    })

    let finalMsg = toolResultToChatMessage(result, {
      id: streamingMsgId,
      insightsSnapshot: context.insights as unknown as Record<string, unknown>,
      previewContext: {
        sheet,
        getComputedValue,
      },
    })

    if (!result.success && !isLlmOnlyMode(classifyMode(input))) {
      finalMsg = { ...processLocalFallback(input), id: streamingMsgId }
    }

    finalizeMessage(streamingMsgId, finalMsg)
    setProcessing(false)
  } catch (err) {
    // On unexpected error, finalize with a generic error message
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    finalizeMessage(streamingMsgId, {
      id: streamingMsgId,
      role: 'assistant',
      content: `⚠️ ${message}`,
      timestamp: Date.now(),
    })
    setProcessing(false)
  }
}

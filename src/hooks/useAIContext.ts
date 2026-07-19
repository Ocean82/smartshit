/**
 * Hook providing live spreadsheet and audit context for the AI chat panel.
 *
 * This is the frontend equivalent of the server-side prompt context builders.
 * It assembles real-time state from the Zustand store into the shape expected
 * by the chat API (SpreadsheetContextPayload + audit results).
 *
 * Implements the useAIContext hook described in docs/chat-prompt/chat.md.
 */

import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { buildSpreadsheetContext, type SpreadsheetContextPayload } from '@/ai/buildContext'

export interface AIContext {
  spreadsheetContext: SpreadsheetContextPayload
  /** Summary stats for lightweight display (e.g., chat header) */
  stats: {
    totalCells: number
    formulaCells: number
    sheets: string[]
    activeSheet: string
    selectedCells: string[]
  }
}

/**
 * Provides the current AI context derived from live spreadsheet state.
 * Memoized to avoid unnecessary recalculations on every render.
 */
export function useAIContext(): AIContext {
  const workbook = useStore((s) => s.workbook)
  const selection = useStore((s) => s.selection)
  const getComputedValue = useStore((s) => s.getComputedValue)
  const getActiveSheet = useStore((s) => s.getActiveSheet)

  const context = useMemo(() => {
    const sheet = getActiveSheet()
    return buildSpreadsheetContext(workbook, sheet, selection, getComputedValue)
  }, [workbook, selection, getComputedValue, getActiveSheet])

  const stats = useMemo(() => ({
    totalCells: context.dimensions.populatedCells,
    formulaCells: Object.keys(context.insights?.columnStats ?? {}).length,
    sheets: context.sheetNames,
    activeSheet: context.activeSheet,
    selectedCells: context.selectedCells,
  }), [context])

  return { spreadsheetContext: context, stats }
}

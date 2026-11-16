/**
 * Chat find / go-to / select through the real store and pipeline.
 *
 * "where is the rent?" classifies as a question (chat mode), which the edit
 * fast paths ignore. The navigation stage must still answer it by selecting
 * the cell, and must stay out of non-commands like "how do I find a cell?".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

const SEND_WAIT_MS = 10_000
vi.setConfig({ testTimeout: SEND_WAIT_MS + 5_000 })

function resetStore() {
  const wb = createEmptyWorkbook('Navigation Test')
  useStore.getState().engine.loadWorkbook(wb)
  useStore.setState({
    workbook: wb,
    activeSheetId: wb.sheets[0].id,
    selection: null,
    additionalSelections: [],
    revealRequest: null,
    messages: [],
    undoStack: [],
    redoStack: [],
    chatInput: '',
    isAiProcessing: false,
    applyPosture: 'preview',
  })
  const s = useStore.getState()
  s.setCellValue('A1', 'Category'); s.setCellValue('B1', 'Amount')
  s.setCellValue('A2', 'Rent'); s.setCellValue('B2', 1500)
  s.setCellValue('A3', 'Netflix'); s.setCellValue('B3', 15)
  s.setCellValue('A4', 'Food'); s.setCellValue('B4', 400)
  s.setCellValue('A5', 'Netflix'); s.setCellValue('B5', 15)
}

async function send(input: string) {
  useStore.setState({ chatInput: input })
  useStore.getState().sendMessage()
  await vi.waitFor(() => {
    expect(useStore.getState().isAiProcessing).toBe(false)
  }, { timeout: SEND_WAIT_MS })
  return [...useStore.getState().messages].reverse().find((m) => m.role === 'assistant')
}

describe('chat navigation', () => {
  beforeEach(() => resetStore())

  it('answers a question by selecting and revealing the cell', async () => {
    const reply = await send('where is the rent?')
    const s = useStore.getState()
    expect(s.selection).toEqual({ startRow: 1, startCol: 0, endRow: 1, endCol: 0 })
    expect(s.revealRequest).toMatchObject({ row: 1, col: 0 })
    expect(reply?.content).toContain('**A2**')
    expect(reply?.actions ?? []).toEqual([]) // nothing to Apply: the sheet is unchanged
  })

  it('selects every match of a search', async () => {
    await send('find netflix')
    const s = useStore.getState()
    expect(s.selection).toEqual({ startRow: 2, startCol: 0, endRow: 2, endCol: 0 })
    expect(s.additionalSelections).toEqual([{ startRow: 4, startCol: 0, endRow: 4, endCol: 0 }])
  })

  it('goes to a cell and selects a column', async () => {
    await send('go to C5')
    expect(useStore.getState().selection).toEqual({ startRow: 4, startCol: 2, endRow: 4, endCol: 2 })
    await send('select column B')
    expect(useStore.getState().selection).toEqual({ startRow: 0, startCol: 1, endRow: 4, endCol: 1 })
  })

  it('never edits the sheet or adds an undo entry', async () => {
    const before = JSON.stringify(useStore.getState().getActiveSheet().cells)
    const undoBefore = useStore.getState().undoStack.length
    await send('find rent')
    expect(JSON.stringify(useStore.getState().getActiveSheet().cells)).toBe(before)
    expect(useStore.getState().undoStack.length).toBe(undoBefore)
  })

  it('does not navigate on a non-command', async () => {
    await send('how do I find a cell?')
    expect(useStore.getState().selection).toBeNull()
    expect(useStore.getState().revealRequest).toBeNull()
  })
})

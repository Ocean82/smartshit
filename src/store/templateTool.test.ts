import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import type { ChatMessage } from '@/types'

function resetStore() {
  const wb = createEmptyWorkbook('Template Test')
  useStore.getState().engine.loadWorkbook(wb)
  useStore.setState({
    workbook: wb,
    activeSheetId: wb.sheets[0].id,
    selection: null,
    messages: [],
    undoStack: [],
    redoStack: [],
  })
}

describe('template execution through the real store', () => {
  beforeEach(resetStore)

  it('runTemplateTool builds a niche gallery template directly', () => {
    useStore.getState().runTemplateTool('create_wedding_budget')

    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['A1']?.value).toBe('Wedding Budget')
    expect(sheet.cells['C12']?.formula).toBe('=SUM(C5:C10)')
    expect(sheet.cells['A4']?.format?.bold).toBe(true)
    expect(sheet.cells['A4']?.format?.bgColor).toBe('#7C3AED')

    const messages = useStore.getState().messages
    expect(messages[messages.length - 1].content).toContain('Built wedding budget')
  })

  it('runTemplateTool opens chat so the confirmation is visible', () => {
    useStore.setState({ showChat: false })
    useStore.getState().runTemplateTool('create_wedding_budget')
    expect(useStore.getState().showChat).toBe(true)
  })

  it('runTemplateTool is undoable as a single history step', () => {
    useStore.getState().runTemplateTool('create_workout_log')
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Workout Log')

    useStore.getState().undo()
    expect(useStore.getState().getActiveSheet().cells['A1']?.value ?? null).toBeNull()
  })

  it('applyAction executes a core template via the LLM apply path', () => {
    const msg: ChatMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: 'I can build that.',
      timestamp: Date.now(),
      actions: [{
        id: 'action-1',
        tool: 'create_budget_template',
        params: {},
        description: 'Create monthly budget template',
        status: 'pending',
      }],
    }
    useStore.getState().addMessage(msg)
    useStore.getState().applyAction('action-1')

    const sheet = useStore.getState().getActiveSheet()
    expect(String(sheet.cells['A1']?.value)).toContain('Monthly Budget')
    expect(sheet.cells['A3']?.format?.bold).toBe(true)

    const applied = useStore.getState().messages
      .flatMap((m) => m.actions ?? [])
      .find((a) => a.id === 'action-1')
    expect(applied?.status).toBe('applied')
  })

  it('sendMessage builds a niche template from a gallery prompt without the LLM', async () => {
    useStore.setState({ chatInput: 'Create a wedding budget tracker', isAiProcessing: false })
    useStore.getState().sendMessage()

    // sendMessage kicks off an async IIFE — wait for it to finish
    await vi.waitFor(() => {
      expect(useStore.getState().isAiProcessing).toBe(false)
    })

    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['A1']?.value).toBe('Wedding Budget')
    expect(sheet.cells['C12']?.formula).toBe('=SUM(C5:C10)')

    const lastAssistant = [...useStore.getState().messages].reverse().find((m) => m.role === 'assistant')
    expect(lastAssistant?.content).toContain('Built wedding budget')
  })
})

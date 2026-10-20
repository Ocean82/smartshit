/**
 * Integration test: set_validation applies through the normal chatSlice Apply
 * path and is reverted as exactly ONE undo entry.
 *
 * Pins plan decision #6: validation lives on CellData.validation, which
 * diffWorkbooks/cellsEqual/deepCloneCell already capture, so set_validation
 * produces a single undo entry just like set_checkbox — no undo gap.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { captureActionScope } from '@/lib/actionScope'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Validation Undo Test')
  useStore.getState().engine.loadWorkbook(wb)
  useStore.setState({
    workbook: wb,
    activeSheetId: wb.sheets[0].id,
    selection: null,
    messages: [],
    undoStack: [],
    redoStack: [],
    chatInput: '',
    isAiProcessing: false,
    toasts: [],
    applyPosture: 'preview',
  })
}

function seedData() {
  const store = useStore.getState()
  store.setCellValue('A1', 'Priority')
  store.setCellValue('A2', 'Rent')
  store.setCellValue('A3', 'Food')
}

function injectAction(tool: string, params: Record<string, unknown>) {
  const state = useStore.getState()
  const scope = captureActionScope({
    workbook: state.workbook,
    activeSheetId: state.activeSheetId,
    selection: state.selection,
    workbookRevision: state.workbookRevision,
  })
  const action = {
    id: uuid(),
    tool,
    params,
    description: `Apply ${tool}`,
    status: 'pending' as const,
    scope,
  }
  useStore.setState((s) => ({
    messages: [
      ...s.messages,
      {
        id: uuid(),
        role: 'assistant' as const,
        content: 'Proposed change.',
        timestamp: Date.now(),
        actions: [action],
      },
    ],
  }))
  return action.id
}

function storedAction(actionId: string) {
  return useStore.getState().messages
    .flatMap((message) => message.actions ?? [])
    .find((candidate) => candidate.id === actionId)
}

describe('set_validation — Apply + single-entry undo', () => {
  beforeEach(() => resetStore())

  it('applies a dropdown validation to each target cell and undoes it as one entry', () => {
    seedData()
    const undoDepthBefore = useStore.getState().undoStack.length

    const actionId = injectAction('set_validation', {
      range: 'B2:B3',
      type: 'list',
      values: ['High', 'Medium', 'Low'],
    })
    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('applied')
    const cells = () => useStore.getState().getActiveSheet().cells
    expect(cells()['B2']?.validation).toEqual({ type: 'list', values: ['High', 'Medium', 'Low'] })
    expect(cells()['B3']?.validation).toEqual({ type: 'list', values: ['High', 'Medium', 'Low'] })

    // Exactly one undo entry was added for the whole range apply.
    expect(useStore.getState().undoStack.length).toBe(undoDepthBefore + 1)

    useStore.getState().undo()

    expect(cells()['B2']?.validation).toBeUndefined()
    expect(cells()['B3']?.validation).toBeUndefined()
    expect(useStore.getState().undoStack.length).toBe(undoDepthBefore)
  })
})

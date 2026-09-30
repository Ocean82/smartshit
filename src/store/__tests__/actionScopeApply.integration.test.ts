/**
 * Integration test: pending actions are bound to the state they were reviewed
 * against, and a stale action is rejected instead of applied elsewhere.
 *
 * Reproduced defect: a proposal previewed on sheet A changed sheet B after a
 * tab switch, because Apply read the *current* active sheet and selection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { captureActionScope } from '@/lib/actionScope'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Scope Test')
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
  })
}

function seedData() {
  const store = useStore.getState()
  store.setCellValue('A1', 'Item')
  store.setCellValue('B1', 'Amount')
  store.setCellValue('A2', 'Rent')
  store.setCellValue('B2', 100)
}

/** Inject a pending action the way the chat pipeline does (scope attached). */
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
        content: 'Here is a proposed change.',
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

describe('action scope binding on Apply', () => {
  beforeEach(() => resetStore())

  it('binds the captured workbook, sheet, selection and revision', async () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['x']] })
    const scope = storedAction(actionId)?.scope
    expect(scope).toBeTruthy()
    expect(scope?.workbookId).toBe(useStore.getState().workbook.id)
    expect(scope?.sheetId).toBe(useStore.getState().activeSheetId)
    expect(scope?.selection).toBeNull()
    expect(typeof scope?.revision).toBe('number')
    expect(scope?.sheetSignature).toBeTruthy()
  })

  it('rejects an action after the sheet changed instead of applying it elsewhere', async () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['x']] })

    // The user edits the sheet after the proposal was made.
    useStore.getState().setCellValue('B2', 999)

    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('stale')
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Item')
    const last = useStore.getState().messages.at(-1)
    expect(last?.content).toMatch(/changed after the preview/i)
    expect(last?.content).toMatch(/Nothing was changed/i)
  })

  it('rejects an action after a tab switch', () => {
    seedData()
    const firstSheetId = useStore.getState().activeSheetId
    useStore.getState().addSheet('Second')
    // addSheet activates the new tab — go back so the proposal is made on sheet A.
    useStore.getState().setActiveSheet(firstSheetId)
    const secondSheetId = useStore.getState().workbook.sheets.find((s) => s.id !== firstSheetId)!.id
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['x']] })

    useStore.getState().setActiveSheet(secondSheetId)
    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('stale')
    expect(useStore.getState().messages.at(-1)?.content).toMatch(/different sheet/i)
  })

  it('rejects an action after the selection changed', () => {
    seedData()
    useStore.getState().setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['x']] })

    useStore.getState().setSelection({ startRow: 3, startCol: 3, endRow: 3, endCol: 3 })
    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('stale')
    expect(useStore.getState().messages.at(-1)?.content).toMatch(/selection changed/i)
  })

  it('rejects an action after the workbook was replaced by an import', () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['x']] })

    useStore.getState().importWorkbook(createEmptyWorkbook('Fresh import'))
    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('stale')
    expect(useStore.getState().messages.at(-1)?.content).toMatch(/different workbook/i)
  })

  it('rejects an action after an undo moved the workbook back', async () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['x']] })

    // An undoable edit, then Undo: the workbook is back to an earlier state, so
    // the proposal (prepared against the later one) must not be applied.
    useStore.getState().setSelection({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 })
    useStore.getState().setCellFormat('B2', { bold: true })
    useStore.getState().undo()
    useStore.getState().setSelection(null)
    await Promise.resolve()

    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('stale')
  })

  it('still applies an action when nothing moved', () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['Replaced']] })

    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('applied')
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Replaced')
  })

  it('ignores a second Apply click on the same action', () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['Replaced']] })

    useStore.getState().applyAction(actionId)
    useStore.getState().applyAction(actionId)
    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('applied')
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Replaced')
    // One action → exactly one undo entry.
    expect(useStore.getState().undoStack).toHaveLength(1)
  })

  it('blocks a second concurrent send at the store boundary', async () => {
    useStore.setState({ chatInput: 'sort by amount' })
    const first = useStore.getState().sendMessage()
    useStore.setState({ chatInput: 'sort by amount again' })
    const second = useStore.getState().sendMessage()

    await vi.waitFor(() => {
      expect(useStore.getState().isAiProcessing).toBe(false)
    }, { timeout: 5000 })

    const userMessages = useStore.getState().messages.filter((m) => m.role === 'user')
    expect(userMessages).toHaveLength(1)
    await expect(Promise.all([first, second])).resolves.toBeDefined()
  })
})

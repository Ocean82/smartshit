/**
 * Integration test: apply-posture behaviors in chatSlice.
 *
 * Covers:
 *  - §9 Undo toast: a successful Apply fires a success toast carrying undoAction.
 *  - §9 guard: a Reject landing mid-flight fires NO toast.
 *  - §6 auto-apply gate: shouldAutoApply decides which pending actions the
 *    post-finalize pass clicks Apply on (low-risk applies, high-impact stays).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { captureActionScope } from '@/lib/actionScope'
import { shouldAutoApply } from '@/lib/applyPosture'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Posture Test')
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

describe('apply-posture — Undo toast (§9)', () => {
  beforeEach(() => resetStore())

  it('fires a success toast with an undoAction when an action applies', () => {
    seedData()
    const showToast = vi.spyOn(useStore.getState(), 'showToast')
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['Replaced']] })

    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('applied')
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        undoAction: expect.any(Function),
      }),
    )
    showToast.mockRestore()
  })

  it('does not fire a toast when the apply is refused (stale scope)', () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['Replaced']] })
    const showToast = vi.spyOn(useStore.getState(), 'showToast')

    // Move the sheet so the scope guard refuses the apply before execution.
    useStore.getState().setCellValue('B2', 999)
    useStore.getState().applyAction(actionId)

    expect(storedAction(actionId)?.status).toBe('stale')
    expect(showToast).not.toHaveBeenCalled()
    showToast.mockRestore()
  })

  it('the toast undoAction reverts the applied change', () => {
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['Replaced']] })
    let captured: (() => void) | undefined
    const showToast = vi.spyOn(useStore.getState(), 'showToast')
      .mockImplementation((toast) => { captured = toast.undoAction })

    useStore.getState().applyAction(actionId)
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Replaced')

    expect(captured).toBeTypeOf('function')
    captured!()
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Item')
    showToast.mockRestore()
  })

  it('the toast undoAction is a no-op once a newer edit is on top of the undo stack', () => {
    // Stale-stack guard: the toast lives ~4s, during which the user can make
    // another edit. A bare undo() would then revert THAT edit, not the AI one.
    // The captured undo-entry id must gate the undo so newer history is safe.
    seedData()
    const actionId = injectAction('set_range', { startCell: 'A1', values: [['Replaced']] })
    let captured: (() => void) | undefined
    const showToast = vi.spyOn(useStore.getState(), 'showToast')
      .mockImplementation((toast) => { captured = toast.undoAction })

    useStore.getState().applyAction(actionId)
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Replaced')

    // User makes a newer edit AFTER the AI action — pushes a newer undo entry.
    useStore.getState().pushHistory('user edit')
    useStore.getState().setCellValue('C3', 'typed-by-user')

    // Clicking the (still-visible) toast Undo must NOT revert the user's newer
    // edit, and must leave the AI change in place (its entry is no longer top).
    captured!()
    expect(useStore.getState().getActiveSheet().cells['C3']?.value).toBe('typed-by-user')
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('Replaced')
    showToast.mockRestore()
  })
})

describe('apply-posture — auto-apply gate (§6)', () => {
  beforeEach(() => resetStore())

  it('shouldAutoApply drives the post-finalize pass: low-risk applies, high-impact stays', () => {
    seedData()
    const lowRisk = injectAction('format_cells', { range: 'A1:B1', bold: true })
    const highImpact = injectAction('clear_sheet', {})

    // Simulate the sendMessage post-process gate under 'auto'.
    useStore.setState({ applyPosture: 'auto' })
    for (const msg of useStore.getState().messages) {
      for (const action of msg.actions ?? []) {
        if (action.status === 'pending' && shouldAutoApply(action.tool, 'auto')) {
          useStore.getState().applyAction(action.id)
        }
      }
    }

    expect(storedAction(lowRisk)?.status).toBe('applied')
    // clear_sheet is high-impact: never auto-applied, stays pending.
    expect(storedAction(highImpact)?.status).toBe('pending')
  })
})

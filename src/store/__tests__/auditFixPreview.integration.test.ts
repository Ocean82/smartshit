/**
 * Auditor fixes go through the pending-action preview: staging one must not
 * mutate cells, Apply commits exactly the reviewed writes as one undo entry,
 * and Reject leaves the sheet untouched.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { buildAuditFixAction } from '@/lib/auditFixAction'
import { selectPendingPreviewAction } from '@/lib/pendingActionPreview'

function resetStore() {
  const wb = createEmptyWorkbook('Audit Fix Test')
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

function stage() {
  const state = useStore.getState()
  const sheet = state.getActiveSheet()
  const action = buildAuditFixAction('Fix total', [{ cellId: 'C1', formula: 'SUM(A1:B1)' }, { cellId: 'C2', value: 7 }], sheet, state)
  expect(action).not.toBeNull()
  state.addMessage({ id: 'm1', role: 'assistant', content: 'fix', timestamp: 0, actions: [action!] })
  return action!.id
}

const stored = (id: string) =>
  useStore.getState().messages.flatMap((m) => m.actions ?? []).find((a) => a.id === id)

describe('auditor fix goes through preview', () => {
  beforeEach(() => {
    resetStore()
    useStore.getState().setCellValue('A1', 1)
    useStore.getState().setCellValue('B1', 2)
  })

  it('staging previews the change without mutating cells', () => {
    const id = stage()
    const cells = useStore.getState().getActiveSheet().cells
    expect(cells['C1']).toBeUndefined()
    expect(cells['C2']).toBeUndefined()
    const pending = selectPendingPreviewAction(useStore.getState().messages)
    expect(pending?.id).toBe(id)
    expect(pending?.preview?.changes.map((c) => c.cell)).toEqual(['C1', 'C2'])
  })

  it('Apply commits the reviewed writes as a single undo entry', async () => {
    const id = stage()
    const before = useStore.getState().undoStack.length
    useStore.getState().applyAction(id)
    await new Promise((r) => setTimeout(r, 50))
    expect(stored(id)?.status).toBe('applied')
    const cells = useStore.getState().getActiveSheet().cells
    expect(cells['C1']?.formula).toBe('=SUM(A1:B1)')
    expect(cells['C2']?.value).toBe(7)
    expect(useStore.getState().undoStack.length).toBe(before + 1)
    useStore.getState().undo()
    expect(useStore.getState().getActiveSheet().cells['C2']?.value ?? null).toBeNull()
  })

  it('Reject leaves the sheet untouched', () => {
    const id = stage()
    useStore.getState().rejectAction(id)
    expect(stored(id)?.status).toBe('rejected')
    expect(useStore.getState().getActiveSheet().cells['C1']).toBeUndefined()
  })
})

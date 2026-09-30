/**
 * Integration test: reviewed script patches are committed exactly once, and
 * they are undoable.
 *
 * Reproduced defects:
 *  - Apply re-ran the script, so a preview computed with B2 = 10 applied
 *    B3 = 101 after B2 was edited to 100.
 *  - Two Apply clicks before the first execution finished inserted two rows.
 *  - Undo did not revert a completed script change, because pushHistory()
 *    finalised its diff in a microtask that never saw the async mutation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { captureActionScope } from '@/lib/actionScope'
import { scriptPatchSignature, type ScriptPatch } from '@/lib/scriptPatch'
import { applyPreparedScriptAction } from '../aiExecution'
import type { AgentAction } from '@/types'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Script Patch Test')
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
  store.setCellValue('A3', 'Food')
  store.setCellValue('B3', 50)
}

/** Inject a pending execute_script action the way the LLM gateway does. */
function injectScriptAction(code: string, extraParams: Record<string, unknown> = {}) {
  const state = useStore.getState()
  const scope = captureActionScope({
    workbook: state.workbook,
    activeSheetId: state.activeSheetId,
    selection: state.selection,
    workbookRevision: state.workbookRevision,
  })
  const action = {
    id: uuid(),
    tool: 'execute_script',
    params: { code, ...extraParams },
    description: 'Run script',
    status: 'pending' as const,
    scope,
  }
  useStore.setState((s) => ({
    messages: [
      ...s.messages,
      {
        id: uuid(),
        role: 'assistant' as const,
        content: 'Here is a script action.',
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

async function waitForStatus(actionId: string, status: string) {
  await vi.waitFor(() => {
    expect(storedAction(actionId)?.status).toBe(status)
  }, { timeout: 5000 })
}

describe('execute_script — reviewed patch commit', () => {
  beforeEach(() => resetStore())

  it('first Apply only reviews, and the review carries the exact patch', async () => {
    seedData()
    const actionId = injectScriptAction(
      `const sum = getCell("B2") + getCell("B3"); setCell("B4", sum); setFormat("B4", { bold: true });`,
    )

    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'pending')

    const action = storedAction(actionId)
    expect(action?.preview?.changes).toHaveLength(2)
    expect(action?.prepared?.kind).toBe('script')
    expect(action?.prepared?.patch.cellUpdates.B4).toEqual({ value: 150 })
    expect(action?.prepared?.patch.formatUpdates.B4).toEqual({ bold: true })

    // Reviewing must not touch the sheet.
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['B4']).toBeUndefined()
  })

  it('rejects a stale proposal instead of applying it after the sheet moved', async () => {
    seedData()
    const actionId = injectScriptAction(`setCell("B4", getCell("B2") + getCell("B3"));`)

    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'pending')

    // Intervening edit: re-running the script here would write 1050.
    useStore.getState().setCellValue('B2', 1000)

    useStore.getState().applyAction(actionId)
    expect(storedAction(actionId)?.status).toBe('stale')
    expect(useStore.getState().getActiveSheet().cells['B4']).toBeUndefined()
  })

  it('commits the reviewed patch verbatim, without re-running the script', async () => {
    seedData()
    // The script would now compute 1050 — but the reviewed patch says 150.
    useStore.getState().setCellValue('B2', 1000)

    const state = useStore.getState()
    const patch: ScriptPatch = {
      cellUpdates: { B4: { value: 150 } },
      formatUpdates: {},
      rowDeletions: [],
      rowInsertions: [],
    }
    const action: AgentAction = {
      id: uuid(),
      tool: 'execute_script',
      params: { code: `setCell("B4", getCell("B2") + getCell("B3"))` },
      description: 'Run script',
      status: 'pending',
      prepared: { kind: 'script', patch, signature: scriptPatchSignature(patch) },
      scope: captureActionScope({
        workbook: state.workbook,
        activeSheetId: state.activeSheetId,
        selection: state.selection,
        workbookRevision: state.workbookRevision,
      }),
    }

    const result = await applyPreparedScriptAction(
      action,
      () => useStore.getState() as never,
      ((fn: (s: unknown) => void) => useStore.setState(fn as never)) as never,
    )

    expect(result.success).toBe(true)
    expect(useStore.getState().getActiveSheet().cells['B4']?.value).toBe(150)
    expect(useStore.getState().undoStack).toHaveLength(1)
  })

  it('refuses to commit a patch whose signature no longer matches', async () => {
    seedData()
    const patch: ScriptPatch = {
      cellUpdates: { B4: { value: 150 } },
      formatUpdates: {},
      rowDeletions: [],
      rowInsertions: [],
    }
    const action: AgentAction = {
      id: uuid(),
      tool: 'execute_script',
      params: { code: `setCell("B4", 150)` },
      description: 'Run script',
      status: 'pending',
      // Tampered patch: the signature no longer describes the payload.
      prepared: { kind: 'script', patch, signature: 'not-the-reviewed-signature' },
    }

    const result = await applyPreparedScriptAction(
      action,
      () => useStore.getState() as never,
      ((fn: (s: unknown) => void) => useStore.setState(fn as never)) as never,
    )

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/no longer match/i)
    expect(useStore.getState().getActiveSheet().cells['B4']).toBeUndefined()
  })

  it('a double Apply executes the script exactly once', async () => {
    seedData()
    const actionId = injectScriptAction(`insertRow(2);`)

    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'pending')

    // Both clicks land before the first commit resolves.
    useStore.getState().applyAction(actionId)
    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'applied')

    const rowsWithFood = Object.entries(useStore.getState().getActiveSheet().cells)
      .filter(([, cell]) => cell.value === 'Food')
    expect(rowsWithFood).toHaveLength(1)
  })

  it('the applied script change is undoable and redoable', async () => {
    seedData()
    const actionId = injectScriptAction(`setCell("B4", 150); setFormat("B4", { bold: true });`)

    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'pending')
    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'applied')

    expect(useStore.getState().getActiveSheet().cells['B4']?.value).toBe(150)
    expect(useStore.getState().undoStack).toHaveLength(1)

    useStore.getState().undo()
    expect(useStore.getState().getActiveSheet().cells['B4']).toBeUndefined()

    useStore.getState().redo()
    expect(useStore.getState().getActiveSheet().cells['B4']?.value).toBe(150)
    expect(useStore.getState().getActiveSheet().cells['B4']?.format?.bold).toBe(true)
  })

  it('rejects the action when the script cannot be reviewed', async () => {
    seedData()
    const actionId = injectScriptAction(`throw new Error("boom")`)

    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'rejected')

    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['B4']).toBeUndefined()
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  it('a forged preview does not bypass the dry-run review gate', async () => {
    seedData()
    // A model-supplied `previewChanges: []` used to satisfy the "has a preview"
    // check and execute on the first Apply. It must not.
    const actionId = injectScriptAction(`setCell("B4", 999);`, { previewChanges: [] })

    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'pending')

    const stored = storedAction(actionId)
    expect(stored?.preview?.changes).toHaveLength(1)
    expect(stored?.preview?.changes[0].newValue).toBe(999)
    expect(stored?.prepared?.kind).toBe('script')
    // Nothing executed yet.
    expect(useStore.getState().getActiveSheet().cells['B4']).toBeUndefined()
  })

  it('keeps a rejected status when the dry-run lands mid-flight', async () => {
    const store = useStore.getState()
    store.setCellValue('A1', 1)
    const code = 'return { A1: 20 }'
    const { buildScriptPreview } = await import('@/lib/scriptPreview')
    const pending = buildScriptPreview(code, {
      sheet: useStore.getState().getActiveSheet(),
      getComputedValue: useStore.getState().getComputedValue,
    })
    store.addMessage({
      id: 'midflight',
      role: 'assistant',
      content: 'patch',
      timestamp: Date.now(),
      actions: [
        { id: 'midflight', tool: 'execute_script', params: { code }, description: 'Run script', status: 'pending' },
      ],
    })
    useStore.getState().applyAction('midflight')
    // Reject while the dry-run is in flight, then let it resolve.
    useStore.getState().rejectAction('midflight')
    await pending
    await Promise.resolve()
    await Promise.resolve()
    const action = useStore
      .getState()
      .messages.find((m) => m.id === 'midflight')
      ?.actions?.[0]
    expect(action?.status).toBe('rejected')
    expect(action?.prepared).toBeUndefined()
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe(1)
  })
})

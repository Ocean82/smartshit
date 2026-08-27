/**
 * Integration test: execute_script approval preview
 *
 * Verifies the user-approval gate for the sandbox: an `execute_script` action
 * without a preview must first run a collect-only dry-run that attaches a
 * preview WITHOUT mutating the sheet, and only a second Apply executes it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Script Test')
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

/** Inject a pending execute_script action as an assistant message. */
function injectScriptAction(code: string) {
  const action = {
    id: uuid(),
    tool: 'execute_script',
    params: { code, description: 'Run script' },
    description: 'Run script',
    status: 'pending' as const,
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

async function waitForPreview(actionId: string) {
  await vi.waitFor(() => {
    const msg = [...useStore.getState().messages].reverse().find((m) => m.actions)
    const action = msg?.actions?.find((a) => a.id === actionId)
    expect(action?.preview).toBeTruthy()
  }, { timeout: 5000 })
}

describe('execute_script approval preview', () => {
  beforeEach(() => resetStore())

  it('attaches a preview on first Apply without mutating the sheet, then applies on second Apply', async () => {
    seedData()
    const actionId = injectScriptAction(
      `const sum = getCell("B2") + getCell("B3"); setCell("B4", sum); setFormat("B4", { bold: true });`,
    )

    // First Apply: dry-run preview only — sheet unchanged.
    useStore.getState().applyAction(actionId)
    await waitForPreview(actionId)

    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['B4']?.value).toBeUndefined()
    expect(Object.keys(sheet.cells).includes('B4')).toBe(false)

    const msg = [...useStore.getState().messages].reverse().find((m) => m.actions)
    const action = msg?.actions?.find((a) => a.id === actionId)
    expect(action?.preview?.changes.length).toBe(2)
    const b4 = action?.preview?.changes.find((c) => c.cell === 'B4')
    expect(b4?.newValue).toBe(150)
    expect(action?.preview?.changes.some((c) => c.description?.startsWith('format:'))).toBe(true)

    // Second Apply: now the script really runs against the sheet.
    useStore.getState().applyAction(actionId)
    await vi.waitFor(() => {
      const after = useStore.getState().getActiveSheet()
      expect(after.cells['B4']?.value).toBe(150)
    }, { timeout: 5000 })
    const sheetAfter = useStore.getState().getActiveSheet()
    expect(sheetAfter.cells['B4']?.value).toBe(150)
    expect(sheetAfter.cells['B4']?.format?.bold).toBe(true)
  })

  it('rejects the action when the script cannot be reviewed (script error)', async () => {
    seedData()
    const actionId = injectScriptAction(`throw new Error("boom")`)

    useStore.getState().applyAction(actionId)
    await vi.waitFor(() => {
      const msg = [...useStore.getState().messages].reverse().find((m) => m.actions)
      const action = msg?.actions?.find((a) => a.id === actionId)
      expect(action?.status).toBe('rejected')
    }, { timeout: 5000 })

    const sheet = useStore.getState().getActiveSheet()
    expect(Object.keys(sheet.cells).includes('B4')).toBe(false)
  })
})

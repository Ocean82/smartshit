/**
 * Integration test (FEAT-002): a makeover macro is scoped to the sheet that was
 * active when Apply began, for both formatting target and undo/rollback.
 *
 * Reproduced defects:
 *  - #3 Mid-run sheet switch redirects formatting: switching the active sheet
 *    between awaited steps made later steps format the newly active sheet.
 *  - #2 Concurrent edits lost: the whole-workbook snapshot/rollback/undo-diff
 *    swept in a concurrent edit on another sheet — a successful macro's undo
 *    reverted it, and a failed macro's rollback erased it.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { executeMacroAction } from '../aiExecution'
import type { AgentAction } from '@/types'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Macro Scope Test')
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

/** Add a second sheet and return both sheet ids; leaves `first` active. */
function twoSheets(): { first: string; second: string } {
  const first = useStore.getState().activeSheetId
  useStore.getState().addSheet('Second')
  const second = useStore.getState().workbook.sheets.find((s) => s.id !== first)!.id
  // addSheet activates the new tab — go back so the macro is applied on `first`.
  useStore.getState().setActiveSheet(first)
  return { first, second }
}

function sheet(sheetId: string) {
  return useStore.getState().workbook.sheets.find((s) => s.id === sheetId)!
}

function makeMacroAction(steps: AgentAction['params']['steps']): AgentAction {
  return {
    id: uuid(),
    tool: 'execute_macro',
    params: { steps },
    description: 'Professionalize sheet',
    status: 'pending',
  }
}

const get = (() => useStore.getState()) as never
const set = ((fn: (s: unknown) => void) => useStore.setState(fn as never)) as never

describe('executeMacroAction — target-sheet scope (FEAT-002)', () => {
  beforeEach(() => resetStore())

  it('#3 formats the sheet active at Apply even if the user switches tabs mid-run', async () => {
    const { first, second } = twoSheets()

    const action = makeMacroAction([
      { tool: 'format_cells', params: { range: 'A1', bold: true }, description: 'bold A1' },
      { tool: 'format_cells', params: { range: 'A2', italic: true }, description: 'italic A2' },
    ])

    // Kick off the macro WITHOUT awaiting. The first step runs synchronously
    // (format_cells is sync inside executeToolAsync), then the macro yields on
    // the per-step timeout microtask. Switch the active sheet during that gap —
    // the second step must still land on `first`.
    const pending = executeMacroAction(action, get, set)
    useStore.getState().setActiveSheet(second)
    const result = await pending

    expect(result.success).toBe(true)
    // Both steps formatted the ORIGINAL target sheet…
    expect(sheet(first).cells['A1']?.format?.bold).toBe(true)
    expect(sheet(first).cells['A2']?.format?.italic).toBe(true)
    // …and NOT the sheet that became active mid-run.
    expect(sheet(second).cells['A1']?.format?.bold).toBeUndefined()
    expect(sheet(second).cells['A2']?.format?.italic).toBeUndefined()
    // One macro = one undo entry.
    expect(useStore.getState().undoStack).toHaveLength(1)
  })

  it('#2 a concurrent edit on another sheet survives a successful macro undo', async () => {
    const { first, second } = twoSheets()

    const action = makeMacroAction([
      { tool: 'format_cells', params: { range: 'A1', bold: true }, description: 'bold A1' },
      { tool: 'format_cells', params: { range: 'A2', italic: true }, description: 'italic A2' },
    ])

    const pending = executeMacroAction(action, get, set)
    // User edits a DIFFERENT sheet while the macro runs.
    useStore.getState().setActiveSheet(second)
    useStore.getState().setCellValue('A1', 'concurrent')
    useStore.getState().setActiveSheet(first)
    const result = await pending

    expect(result.success).toBe(true)
    expect(useStore.getState().undoStack).toHaveLength(1)

    // Undo the macro: it must revert the formatting but leave the concurrent
    // edit on the other sheet intact.
    useStore.getState().undo()
    expect(sheet(first).cells['A1']?.format?.bold).toBeUndefined()
    expect(sheet(second).cells['A1']?.value).toBe('concurrent')
  })

  it('#2 a concurrent edit on another sheet survives a failed macro rollback', async () => {
    const { first, second } = twoSheets()

    // Second step fails (unknown tool) → rollback. It must restore only `first`
    // and leave the concurrent edit on `second` untouched.
    const action = makeMacroAction([
      { tool: 'format_cells', params: { range: 'A1', bold: true }, description: 'bold A1' },
      { tool: 'definitely_not_a_tool', params: {}, description: 'boom' },
    ])

    const pending = executeMacroAction(action, get, set)
    useStore.getState().setActiveSheet(second)
    useStore.getState().setCellValue('A1', 'concurrent')
    useStore.getState().setActiveSheet(first)
    const result = await pending

    expect(result.success).toBe(false)
    // Rollback undid the first step's formatting on the target sheet…
    expect(sheet(first).cells['A1']?.format?.bold).toBeUndefined()
    // …but the concurrent edit on the other sheet is still there.
    expect(sheet(second).cells['A1']?.value).toBe('concurrent')
    // A failed macro pushes no undo entry.
    expect(useStore.getState().undoStack).toHaveLength(0)
  })
})

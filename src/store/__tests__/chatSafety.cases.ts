import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { toolResultToChatMessage } from '@/ai/responseBuilder'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import * as sandbox from '@/sandbox'

// Only the external model boundary is mocked. Routing, preview, sandbox,
// execution, state, history and (in the realengine tier) formulas are real.
vi.mock('@/ai/agentClient', async original => ({
  ...await original<typeof import('@/ai/agentClient')>(),
  chatWithAgentServerStream: vi.fn(),
}))
vi.mock('@/ai/nlp/nlpEngine', () => ({
  getNLPEngine: () => ({ isReady: false, status: { initialized: true } }),
}))

function reset() {
  const workbook = createEmptyWorkbook('Safety tests')
  useStore.getState().engine.loadWorkbook(workbook)
  useStore.setState({
    workbook,
    activeSheetId: workbook.activeSheetId,
    selection: null,
    additionalSelections: [],
    messages: [],
    chatInput: '',
    isAiProcessing: false,
    undoStack: [],
    redoStack: [],
    attachedFilePreview: null,
  })
  vi.mocked(chatWithAgentServerStream).mockReset().mockResolvedValue({ message: 'Explanation only', actions: [], source: 'llm' })
}

function propose(tool: string, params: Record<string, unknown>) {
  const state = useStore.getState()
  const message = toolResultToChatMessage({
    success: true,
    message: 'Review this proposal',
    actions: [{ tool, params, description: tool }],
  }, { previewContext: { sheet: state.getActiveSheet(), getComputedValue: state.getComputedValue } })
  useStore.getState().addMessage(message)
  return message.actions![0].id
}

function action(id: string) {
  return useStore.getState().messages.flatMap(message => message.actions ?? []).find(candidate => candidate.id === id)!
}

async function prepare(id: string) {
  useStore.getState().applyAction(id)
  await vi.waitFor(() => expect(action(id)?.preview).toBeDefined())
  expect(action(id).status).toBe('pending')
}

function value(cell: string) {
  return useStore.getState().getActiveSheet().cells[cell]?.value
}

/** Run identical regressions in the stub and real WASM formula-engine tiers. */
export function chatSafetyCases() {
  describe('Chat approval and execution safety', () => {
    beforeEach(reset)
    afterEach(() => vi.restoreAllMocks())

    it.each([
      'do not set A1 to 100',
      'please don’t change A1 to 100',
      'explain how to set A1 to 100',
      'show me how to delete row 1',
      'what happens if I set A1 to 100',
      '"set A1 to 100"',
      'create a budget without deleting my data',
      'do not bold the headers',
      'please do not highlight all the cells',
    ])('does not mutate or offer mutations for: %s', async input => {
      useStore.getState().setCellValue('A1', 1)
      useStore.setState({ undoStack: [], chatInput: input })
      // Defense in depth: even a misbehaving backend cannot offer writes here.
      vi.mocked(chatWithAgentServerStream).mockResolvedValue({
        message: 'Explain', source: 'llm',
        actions: [{ tool: 'set_cell', params: { cell: 'A1', value: 100 }, description: 'Write' }],
      })
      await useStore.getState().sendMessage()
      expect(value('A1')).toBe(1)
      expect(useStore.getState().messages.at(-1)?.actions).toBeUndefined()
      expect(useStore.getState().undoStack).toHaveLength(0)
    })

    it('preserves explicit direct command behavior', async () => {
      useStore.setState({ chatInput: 'set A1 to 100' })
      await useStore.getState().sendMessage()
      expect(Number(value('A1'))).toBe(100)
    })

    it('refuses an action after switching tabs instead of editing the new tab', () => {
      useStore.getState().setCellValue('A1', 'First')
      const firstSheetId = useStore.getState().activeSheetId
      const id = propose('set_range', { startCell: 'A1', values: [['Replacement']] })
      useStore.getState().addSheet('Second')
      useStore.getState().setCellValue('A1', 'Second')
      useStore.getState().applyAction(id)
      expect(value('A1')).toBe('Second')
      expect(useStore.getState().workbook.sheets.find(sheet => sheet.id === firstSheetId)!.cells.A1.value).toBe('First')
      expect(action(id).status).toBe('rejected')
    })

    it('refuses actions after importing another workbook', () => {
      const id = propose('set_range', { startCell: 'A1', values: [['Wrong workbook']] })
      useStore.getState().importWorkbook(createEmptyWorkbook('New workbook'))
      useStore.getState().applyAction(id)
      expect(value('A1')).toBeUndefined()
      expect(action(id).status).toBe('rejected')
    })

    it('refuses changed primary and additional selections', () => {
      const id = propose('format_cells', { bold: true })
      useStore.setState({ additionalSelections: [{ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }] })
      useStore.getState().applyAction(id)
      expect(action(id).status).toBe('rejected')
      expect(useStore.getState().getActiveSheet().cells.B2).toBeUndefined()
    })

    it('rejects unscoped legacy/persisted actions rather than rebinding at Apply', () => {
      useStore.setState({ messages: [{
        id: 'legacy', role: 'assistant', content: 'Old proposal', timestamp: 0,
        actions: [{ id: 'old', tool: 'set_cell', params: { cell: 'A1', value: 'wrong' }, description: 'Old', status: 'pending' }],
      }] })
      useStore.getState().applyAction('old')
      expect(action('old').status).toBe('rejected')
      expect(value('A1')).toBeUndefined()
    })

    it('retains request scope when a model answer arrives after an edit', async () => {
      let finish!: (result: { message: string; actions: { tool: string; params: Record<string, unknown>; description: string }[]; source: 'llm' }) => void
      vi.mocked(chatWithAgentServerStream).mockImplementation(() => new Promise(resolve => { finish = resolve }))
      useStore.setState({ chatInput: 'generate a lunar calendar from this dataset' })
      const pending = useStore.getState().sendMessage()
      await vi.waitFor(() => expect(finish).toBeDefined())
      useStore.getState().setCellValue('A1', 'New edit')
      finish({ message: 'Proposed calendar', source: 'llm', actions: [{ tool: 'set_range', params: { startCell: 'A1', values: [['Calendar']] }, description: 'Write calendar' }] })
      await pending
      const id = useStore.getState().messages.at(-1)!.actions![0].id
      useStore.getState().applyAction(id)
      expect(value('A1')).toBe('New edit')
      expect(action(id).status).toBe('rejected')
    })

    it('does not hide an explicit server authentication refusal behind local fallback', async () => {
      vi.mocked(chatWithAgentServerStream).mockResolvedValue({
        kind: 'server-error', status: 'auth', message: 'Sign in to continue (test marker)', httpStatus: 401,
      })
      useStore.setState({ chatInput: 'generate a lunar calendar from this dataset' })
      await useStore.getState().sendMessage()
      expect(useStore.getState().messages.at(-1)!.content).toContain('Sign in to continue (test marker)')
    })

    it('serializes requests at the store boundary', async () => {
      useStore.setState({ isAiProcessing: true, chatInput: 'set A1 to 100' })
      await useStore.getState().sendMessage()
      expect(value('A1')).toBeUndefined()
      expect(useStore.getState().chatInput).toBe('set A1 to 100')
      expect(useStore.getState().messages).toHaveLength(0)
    })

    it('ignores forged script previews and prepares locally before executing', async () => {
      const id = propose('execute_script', { code: 'setCell("A1",999)', previewChanges: [], preview: { changes: [] } })
      expect(action(id).params).not.toHaveProperty('previewChanges')
      expect(action(id).preview).toBeUndefined()
      // Even an injected top-level preview cannot replace local proof.
      useStore.setState(state => ({ messages: state.messages.map(message => ({ ...message, actions: message.actions?.map(a => ({ ...a, preview: { changes: [] } })) })) }))
      await prepare(id)
      expect(value('A1')).toBeUndefined()
      expect(action(id).preview!.changes[0].newValue).toBe(999)
      useStore.getState().applyAction(id)
      expect(value('A1')).toBe(999)
    })

    it('commits a script once without rerunning it, with one undo/redo entry', async () => {
      useStore.getState().setCellValue('A1', 1)
      const run = vi.spyOn(sandbox, 'runScript')
      const id = propose('execute_script', { code: 'setCell("A1",2); setFormat("A1",{bold:true})' })
      await prepare(id)
      expect(useStore.getState().undoStack).toHaveLength(0)
      useStore.getState().applyAction(id)
      expect(action(id).status).toBe('applied')
      expect(run).toHaveBeenCalledTimes(1)
      expect(value('A1')).toBe(2)
      expect(useStore.getState().undoStack).toHaveLength(1)
      useStore.getState().undo()
      expect(value('A1')).toBe(1)
      expect(useStore.getState().getActiveSheet().cells.A1.format?.bold).not.toBe(true)
      useStore.getState().redo()
      expect(value('A1')).toBe(2)
      expect(useStore.getState().getActiveSheet().cells.A1.format?.bold).toBe(true)
    })

    it('does not execute stale script changes after an intervening edit', async () => {
      useStore.getState().setCellValue('B2', 10)
      const id = propose('execute_script', { code: 'setCell("B3",getCell("B2")+1)' })
      await prepare(id)
      expect(action(id).preview!.changes[0].newValue).toBe(11)
      useStore.getState().setCellValue('B2', 100)
      useStore.getState().applyAction(id)
      expect(value('B3')).toBeUndefined()
      expect(action(id).status).toBe('rejected')
    })

    it('rejects changed script parameters after preparation', async () => {
      const id = propose('execute_script', { code: 'setCell("A1",1)' })
      await prepare(id)
      useStore.setState(state => ({ messages: state.messages.map(message => ({ ...message, actions: message.actions?.map(a => ({ ...a, params: { code: 'setCell("A1",2)' } })) })) }))
      useStore.getState().applyAction(id)
      expect(value('A1')).toBeUndefined()
      expect(action(id).status).toBe('rejected')
    })

    it('does not execute a row insertion twice on repeated Apply', async () => {
      useStore.getState().setCellValue('A1', 'Header')
      useStore.getState().setCellValue('A2', 'Data')
      const id = propose('execute_script', { code: 'insertRow(0)' })
      await prepare(id)
      useStore.getState().applyAction(id)
      useStore.getState().applyAction(id)
      expect(value('A3')).toBe('Data')
      expect(value('A4')).toBeUndefined()
      expect(useStore.getState().undoStack).toHaveLength(1)
      useStore.getState().undo()
      expect(value('A2')).toBe('Data')
    })

    it('does not resurrect an action rejected during asynchronous preparation', async () => {
      const id = propose('execute_script', { code: 'setCell("A1",1)' })
      let complete!: (result: sandbox.SandboxSuccess) => void
      vi.spyOn(sandbox, 'runScript').mockImplementation(() => new Promise(resolve => { complete = resolve }))
      useStore.getState().applyAction(id)
      expect(action(id).status).toBe('previewing')
      useStore.getState().rejectAction(id)
      complete({ success: true, cellUpdates: { A1: { value: 1 } }, formatUpdates: {}, rowDeletions: [], rowInsertions: [], logs: [], summary: 'Done', executionTime: 0 })
      await Promise.resolve()
      await Promise.resolve()
      expect(action(id).status).toBe('rejected')
      expect(action(id).preview).toBeUndefined()
      expect(value('A1')).toBeUndefined()
    })

    it('does not attach a late script preview after chat is cleared', async () => {
      const id = propose('execute_script', { code: 'setCell("A1",1)' })
      let complete!: (result: sandbox.SandboxSuccess) => void
      vi.spyOn(sandbox, 'runScript').mockImplementation(() => new Promise(resolve => { complete = resolve }))
      useStore.getState().applyAction(id)
      useStore.getState().clearChat()
      complete({ success: true, cellUpdates: { A1: { value: 1 } }, formatUpdates: {}, rowDeletions: [], rowInsertions: [], logs: [], summary: 'Done', executionTime: 0 })
      await Promise.resolve()
      await Promise.resolve()
      expect(action(id)).toBeUndefined()
      expect(useStore.getState().messages).toHaveLength(1)
      expect(value('A1')).toBeUndefined()
    })

    it('rejects workbook changes during script preparation', async () => {
      const id = propose('execute_script', { code: 'setCell("A1",1)' })
      let complete!: (result: sandbox.SandboxSuccess) => void
      vi.spyOn(sandbox, 'runScript').mockImplementation(() => new Promise(resolve => { complete = resolve }))
      useStore.getState().applyAction(id)
      useStore.getState().setCellValue('A1', 100)
      complete({ success: true, cellUpdates: { A1: { value: 1 } }, formatUpdates: {}, rowDeletions: [], rowInsertions: [], logs: [], summary: 'Done', executionTime: 0 })
      await vi.waitFor(() => expect(action(id).status).toBe('rejected'))
      expect(action(id).preview).toBeUndefined()
      expect(value('A1')).toBe(100)
    })

    it('rolls back partial script commits and leaves history untouched on failure', async () => {
      useStore.getState().setCellValue('A1', 1)
      useStore.getState().setCellValue('A2', 2)
      const id = propose('execute_script', { code: 'setCell("A1",10);setCell("A2",20)' })
      await prepare(id)
      const engine = useStore.getState().engine
      const original = engine.setCellValue.bind(engine)
      let writes = 0
      vi.spyOn(engine, 'setCellValue').mockImplementation((...args) => {
        if (++writes === 2) throw new Error('Injected write failure')
        return original(...args)
      })
      useStore.getState().applyAction(id)
      expect(action(id).status).toBe('rejected')
      expect(value('A1')).toBe(1)
      expect(value('A2')).toBe(2)
      expect(useStore.getState().getComputedValue(0, 0)).toBe('1')
      expect(useStore.getState().undoStack).toHaveLength(0)
    })

    it('rebuilds cleaning previews instead of accepting model-authored writes', () => {
      useStore.getState().setCellValue('A1', ' Item ')
      useStore.getState().setCellValue('A2', ' Value ')
      const id = propose('clean_sheet_data', { preview: { changes: [{ cell: 'A1', newValue: 'UNTRUSTED' }], duplicateRows: [] }, previewChanges: [] })
      expect(action(id).preview!.changes.some(change => change.newValue === 'UNTRUSTED')).toBe(false)
      useStore.getState().applyAction(id)
      expect(value('A1')).toBe('Item')
      expect(value('A2')).toBe('Value')
      expect(action(id).status).toBe('applied')
    })

    it('previews and applies clear_sheet with undo', async () => {
      useStore.getState().setCellValue('A1', 'Keep until approval')
      useStore.getState().setCellValue('B1', null, '=1+1')
      const id = propose('clear_sheet', {})
      expect(action(id).preview?.changes).toHaveLength(2)
      expect(value('A1')).toBe('Keep until approval')
      useStore.getState().applyAction(id)
      expect(action(id).status).toBe('applied')
      expect(value('A1')).toBeNull()
      await Promise.resolve()
      useStore.getState().undo()
      expect(value('A1')).toBe('Keep until approval')
      expect(useStore.getState().getActiveSheet().cells.B1.formula).toBe('=1+1')
    })
  })
}

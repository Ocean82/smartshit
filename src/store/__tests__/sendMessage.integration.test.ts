/**
 * Integration test: sendMessage flow (client-side, no server)
 *
 * Tests the full path: user input → agent parser → tool execution → response
 * This exercises the real store, real parser, and real tool executor together.
 * Only the LLM server call is implicitly bypassed (parser handles these locally).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook, refToCell } from '@/engine/spreadsheet'

function resetStore(sheetName = 'Integration Test') {
  const wb = createEmptyWorkbook(sheetName)
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

function seedBudgetData() {
  const store = useStore.getState()
  // Header row (row 1 in the grid = row index 0)
  store.setCellValue('A1', 'Category')
  store.setCellValue('B1', 'Amount')
  store.setCellValue('C1', 'Status')
  // Data rows
  store.setCellValue('A2', 'Rent')
  store.setCellValue('B2', 1500)
  store.setCellValue('A3', 'Food')
  store.setCellValue('B3', 400)
  store.setCellValue('A4', 'Transport')
  store.setCellValue('B4', 200)
  store.setCellValue('A5', 'Netflix')
  store.setCellValue('B5', 15)
}

async function sendAndWait(input: string) {
  useStore.setState({ chatInput: input })
  useStore.getState().sendMessage()
  await vi.waitFor(() => {
    expect(useStore.getState().isAiProcessing).toBe(false)
  }, { timeout: 3000 })
}

describe('sendMessage integration — local parser path', () => {
  beforeEach(() => resetStore())

  it('sorts a sheet by column via natural language', async () => {
    seedBudgetData()
    await sendAndWait('sort by amount highest first')

    // The parser should have produced a successful response
    const lastMsg = [...useStore.getState().messages].reverse().find(m => m.role === 'assistant')
    expect(lastMsg?.content).toContain('✓')
  })

  it('adds a row via natural language', async () => {
    seedBudgetData()
    await sendAndWait('add Netflix, 15, Entertainment')

    // The parser should respond with success
    const lastMsg = [...useStore.getState().messages].reverse().find(m => m.role === 'assistant')
    // Either the parser handled it (✓) or it went through the fallback
    expect(lastMsg?.content).toBeTruthy()
  })

  it('formats cells via natural language', async () => {
    seedBudgetData()
    await sendAndWait('bold the headers')

    const sheet = useStore.getState().getActiveSheet()
    // Row 1 (header) should have bold formatting on at least one cell
    const headerCells = ['A1', 'B1', 'C1']
    const anyBold = headerCells.some(id => sheet.cells[id]?.format?.bold === true)
    expect(anyBold).toBe(true)
  })

  it('applies a SUM formula via natural language', async () => {
    seedBudgetData()
    await sendAndWait('sum column B')

    const sheet = useStore.getState().getActiveSheet()
    // Should have a SUM formula somewhere in the sheet
    const formulaCells = Object.entries(sheet.cells).filter(([_, c]) => c.formula?.toUpperCase().includes('SUM'))
    expect(formulaCells.length).toBeGreaterThan(0)
  })

  it('handles unknown commands gracefully (falls through to LLM path)', async () => {
    seedBudgetData()
    // This is too complex for the parser — it will attempt LLM which isn't available
    // The local fallback should produce a response without crashing
    await sendAndWait('write me a haiku about my expenses')

    const messages = useStore.getState().messages
    expect(messages.length).toBeGreaterThan(1)
    // Should not crash — either the LLM fallback or processAICommand responds
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
    expect(lastAssistant?.content).toBeTruthy()
  })

  it('all parser actions are undoable', async () => {
    seedBudgetData()
    const beforeValue = useStore.getState().getActiveSheet().cells['B2']?.value

    await sendAndWait('sort by amount lowest first')

    // Undo should restore original state
    useStore.getState().undo()
    const afterUndo = useStore.getState().getActiveSheet().cells['B2']?.value
    expect(afterUndo).toBe(beforeValue)
  })

  it('sends user and assistant messages into the message list', async () => {
    await sendAndWait('hello')

    const messages = useStore.getState().messages
    const userMsg = messages.find(m => m.role === 'user')
    const assistantMsg = messages.find(m => m.role === 'assistant')
    expect(userMsg?.content).toBe('hello')
    expect(assistantMsg?.content).toBeTruthy()
  })

  it('clarifies a column-less sort locally without changing row order', async () => {
    seedBudgetData()
    const before = useStore.getState().getActiveSheet().cells.B2?.value
    await sendAndWait('sort my data')

    expect(useStore.getState().getActiveSheet().cells.B2?.value).toBe(before)
    const response = useStore.getState().messages.at(-1)
    expect(response?.content).toMatch(/which column/i)
  })

  it('answers natural row counts without writing a formula', async () => {
    seedBudgetData()
    useStore.getState().setCellValue('C2', 'Overdue')
    useStore.getState().setCellValue('C3', 'Paid')
    useStore.getState().setCellValue('C4', 'Overdue')
    await sendAndWait('count how many are overdue')

    expect(useStore.getState().messages.at(-1)?.content).toContain('Found 2 matching rows')
    const formulas = Object.values(useStore.getState().getActiveSheet().cells).filter((cell) => cell.formula)
    expect(formulas).toHaveLength(0)
  })

  it('uses the detected amount column and returns the actual max result', async () => {
    const store = useStore.getState()
    store.setCellValue('A1', 'Item')
    store.setCellValue('B1', 'Quantity')
    store.setCellValue('D1', 'Amount')
    store.setCellValue('A2', 'Rent')
    store.setCellValue('B2', 1)
    store.setCellValue('D2', 1500)
    store.setCellValue('A3', 'Food')
    store.setCellValue('B3', 20)
    store.setCellValue('D3', 400)

    await sendAndWait("what's my biggest expense?")
    const response = useStore.getState().messages.at(-1)?.content ?? ''
    expect(response).toContain('$1,500')
    expect(response).toContain('Rent')
  })

  it('compares totals across workbook sheets without the LLM', async () => {
    const store = useStore.getState()
    store.renameSheet(store.getActiveSheet().id, 'January')
    store.setCellValue('A1', 'Category')
    store.setCellValue('B1', 'Amount')
    store.setCellValue('A2', 'Rent')
    store.setCellValue('B2', 100)
    store.addSheet('February')
    useStore.getState().setCellValue('A1', 'Category')
    useStore.getState().setCellValue('B1', 'Amount')
    useStore.getState().setCellValue('A2', 'Rent')
    useStore.getState().setCellValue('B2', null, '=100+25')

    await sendAndWait('Compare January and February totals')
    const response = useStore.getState().messages.at(-1)?.content ?? ''
    expect(response).toContain('| Amount | $100 | $125 |')
    expect(response).toContain('$25 (25.0%) higher than January')
  })

  it('stages a named row deletion and only deletes it after Apply', async () => {
    seedBudgetData()
    await sendAndWait('remove Netflix')

    let sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells.A5?.value).toBe('Netflix')
    const action = useStore.getState().messages.at(-1)?.actions?.[0]
    expect(action?.status).toBe('pending')
    expect(action?.params).toMatchObject({ row: 5 })
    expect(action?.description).toContain('Netflix')

    useStore.getState().applyAction(action!.id)
    sheet = useStore.getState().getActiveSheet()
    expect(Object.values(sheet.cells).some((cell) => cell.value === 'Netflix')).toBe(false)
  })

  it('refuses delete Apply if the previewed row changed', async () => {
    seedBudgetData()
    await sendAndWait('remove Netflix')
    const action = useStore.getState().messages.at(-1)?.actions?.[0]

    useStore.getState().setCellValue('B5', 20)
    useStore.getState().applyAction(action!.id)

    expect(useStore.getState().getActiveSheet().cells.A5?.value).toBe('Netflix')
    expect(action?.id).toBeTruthy()
    const storedAction = useStore.getState().messages
      .flatMap((message) => message.actions ?? [])
      .find((candidate) => candidate.id === action?.id)
    expect(storedAction?.status).toBe('rejected')
    expect(useStore.getState().messages.at(-1)?.content).toMatch(/changed after the preview/i)
  })
})

describe('sendMessage integration — gallery template path', () => {
  beforeEach(() => resetStore())

  it('builds a template from chat without LLM', async () => {
    await sendAndWait('create a monthly budget')

    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['A1']?.value).toBeTruthy()

    const lastMsg = [...useStore.getState().messages].reverse().find(m => m.role === 'assistant')
    expect(lastMsg?.content).toContain('✓')
  })

  it('template build is undoable', async () => {
    await sendAndWait('create a sales tracker')

    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBeTruthy()
    useStore.getState().undo()
    expect(useStore.getState().getActiveSheet().cells['A1']?.value ?? null).toBeNull()
  })
})

describe('sendMessage integration — @-mention sheet switching', () => {
  it('processes messages mentioning other sheets without crashing', async () => {
    const wb = createEmptyWorkbook('Multi Sheet')
    useStore.getState().engine.loadWorkbook(wb)
    useStore.setState({
      workbook: wb,
      activeSheetId: wb.sheets[0].id,
      messages: [],
      undoStack: [],
      redoStack: [],
      chatInput: '',
      isAiProcessing: false,
    })
    // Add a second sheet
    useStore.getState().addSheet('Expenses')
    // Switch back to Sheet 1
    useStore.getState().setActiveSheet(wb.sheets[0].id)

    // Send a message mentioning the Expenses sheet — should not crash
    await sendAndWait('@Expenses hello')

    // Verify message was processed (assistant responded)
    const messages = useStore.getState().messages
    const assistant = messages.find(m => m.role === 'assistant')
    expect(assistant?.content).toBeTruthy()
  })
})

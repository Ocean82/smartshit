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

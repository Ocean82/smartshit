/**
 * Chat service routing safety.
 *
 * Regression coverage for the reproduced defect: mode classification happened
 * *after* three stages that mutate the workbook, so "do not set A1 to 100" and
 * "explain how to set A1 to 100" both changed A1 immediately.
 *
 * The service now applies the shared request-safety policy before building the
 * stage chain, so a non-command never reaches a stage that mutates.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, Selection, SheetData, WorkbookData } from '@/types'
import type { ExecutionContext } from '@/agent/executor'
import { SpreadsheetEngine, cellToRef, createEmptyWorkbook } from '@/engine/spreadsheet'
import { processChatMessage, type ChatServiceDeps } from './chatService'

const serverStream = vi.fn()
vi.mock('@/ai/agentClient', () => ({
  chatWithAgentServerStream: (...args: unknown[]) => serverStream(...args),
  isAgentServerError: (value: unknown) =>
    value !== null && typeof value === 'object' && (value as { kind?: string }).kind === 'server-error',
}))

let workbook: WorkbookData
let engine: SpreadsheetEngine
let selection: Selection | null
const messages: ChatMessage[] = []

function activeSheet(): SheetData {
  return workbook.sheets.find((s) => s.id === workbook.activeSheetId)!
}

function makeExecContext(): ExecutionContext {
  const ctx: ExecutionContext = {
    getActiveSheet: () => activeSheet(),
    getSheets: () => workbook.sheets,
    getComputedValue: (row, col, sheetId) =>
      engine.getComputedValue(sheetId ?? workbook.activeSheetId, row, col),
    setCellValue: (cellId, value, formula) => {
      const ref = cellToRef(cellId)
      engine.setCellValue(workbook.activeSheetId, ref.row, ref.col, formula || value)
      const sheet = activeSheet()
      sheet.cells[cellId] = { ...(sheet.cells[cellId] ?? { value: null }), value, formula }
    },
    setCellFormat: (cellId, format) => {
      const sheet = activeSheet()
      const prev = sheet.cells[cellId] ?? { value: null }
      sheet.cells[cellId] = { ...prev, format: { ...prev.format, ...format } }
    },
    bulkSetCells: (cells) => {
      for (const [cellId, data] of Object.entries(cells)) {
        ctx.setCellValue(cellId, data.value, data.formula)
      }
    },
    applySortPatch: () => {},
    setFilters: () => {},
    deleteRow: () => {},
    insertRow: () => {},
    addSheet: () => {},
    renameSheet: () => ({ ok: true }),
    pushHistory: () => {},
  }
  return ctx
}

function makeDeps(): ChatServiceDeps {
  return {
    getWorkbook: () => workbook,
    getActiveSheet: () => activeSheet(),
    getComputedValue: (row, col) => engine.getComputedValue(workbook.activeSheetId, row, col),
    getSheetComputedValue: (sheetId, row, col) => engine.getComputedValue(sheetId, row, col),
    getSelection: () => selection,
    getActiveSheetId: () => workbook.activeSheetId,
    getWorkbookRevision: () => 0,
    getAttachedPreview: () => null,
    getMessages: () => messages,
    setActiveSheet: (sheetId) => { workbook.activeSheetId = sheetId },
    pushHistory: () => {},
    buildExecContext: () => makeExecContext(),
    appendToken: () => {},
    finalizeMessage: (_id, msg) => { messages.push(msg) },
    setProcessing: () => {},
    processLocalFallback: () => ({
      id: 'fallback',
      role: 'assistant',
      content: 'local fallback',
      timestamp: Date.now(),
    }),
  }
}

async function send(input: string): Promise<ChatMessage | undefined> {
  messages.length = 0
  await processChatMessage(input, 'stream-1', makeDeps())
  return messages.at(-1)
}

describe('chatService — non-commands never mutate', () => {
  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
    serverStream.mockResolvedValue(null)
  })

  it('executes an explicit direct command immediately (unchanged behaviour)', async () => {
    await send('set A1 to 100')
    expect(activeSheet().cells['A1']?.value).toBe(100)
  })

  it('does not mutate for a negated command', async () => {
    await send('do not set A1 to 100')
    expect(activeSheet().cells['A1']).toBeUndefined()
  })

  it('does not mutate for an explanatory command', async () => {
    await send('explain how to set A1 to 100')
    expect(activeSheet().cells['A1']).toBeUndefined()
  })

  it('does not mutate for a hypothetical command', async () => {
    await send('what if I set A1 to 100?')
    expect(activeSheet().cells['A1']).toBeUndefined()
  })

  it('does not mutate for a quoted command', async () => {
    await send('say "set A1 to 100"')
    expect(activeSheet().cells['A1']).toBeUndefined()
  })

  it('routes non-commands to the LLM gateway instead', async () => {
    await send('explain how to set A1 to 100')
    expect(serverStream).toHaveBeenCalledTimes(1)
  })
})

describe('chatService — server refusals survive to the user', () => {
  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
  })

  it('renders an auth refusal instead of replacing it with a local fallback', async () => {
    serverStream.mockResolvedValue({
      kind: 'server-error',
      status: 'auth',
      message: 'Your session has expired. Please sign in again to continue.',
      httpStatus: 401,
    })

    const reply = await send('generate a lunar calendar from this dataset')

    expect(reply?.content).toMatch(/session has expired/i)
    expect(reply?.content).not.toMatch(/local fallback/i)
    expect(reply?.suggestions).toContain('Sign in again')
  })

  it('still falls back locally for a transient failure in act mode', async () => {
    serverStream.mockResolvedValue(null)

    const reply = await send('generate a lunar calendar from this dataset')

    expect(reply?.content).toBe('local fallback')
  })
})

describe('chatService — older history is summarized, not dropped', () => {
  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
    serverStream.mockResolvedValue(null)
  })

  function seedConversation(turns: number, firstUserContent: string): void {
    // Alternating user/assistant turns, then the two current-turn placeholders
    // (the user input echo + the streaming assistant placeholder) the store
    // appends before processChatMessage runs.
    for (let i = 0; i < turns; i++) {
      const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant'
      messages.push({
        id: `seed-${i}`,
        role,
        content: i === 0 ? firstUserContent : `${role} turn ${i} content`,
        timestamp: Date.now(),
      })
    }
    // Current-turn placeholders (excluded by `.slice(0, -2)`)
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })
  }

  const CURRENT_INPUT = 'generate a lunar calendar from this dataset'

  it('condenses older turns into a summary line instead of dropping them', async () => {
    // 14 seeded turns + 2 placeholders → 12 real history messages, which exceeds
    // the summarization threshold (8), so older turns must be summarized.
    seedConversation(14, 'EARLY_TOPIC_MARKER budget question')

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(serverStream).toHaveBeenCalledTimes(1)
    const passedHistory = (serverStream.mock.calls[0][0] as { history: { role: string; content: string }[] }).history

    // (a) older messages are represented via a summary, not silently dropped
    const summaryMsg = passedHistory.find((m) => m.content.includes('[Conversation context'))
    expect(summaryMsg).toBeDefined()
    expect(summaryMsg?.content).toContain('EARLY_TOPIC_MARKER')

    // (b) output is still {role, content}-shaped
    for (const m of passedHistory) {
      expect(Object.keys(m).sort()).toEqual(['content', 'role'])
      expect(['user', 'assistant']).toContain(m.role)
    }

    // (c) current-turn placeholders are excluded (`.slice(0, -2)` preserved)
    expect(passedHistory.some((m) => m.content === CURRENT_INPUT)).toBe(false)
    expect(passedHistory.some((m) => (m as { id?: string }).id === 'stream-1')).toBe(false)
  })

  it('leaves a short conversation verbatim with no summary line', async () => {
    // 4 seeded turns + 2 placeholders → 4 real history messages, at/under the
    // summarization threshold, so no summary is injected.
    seedConversation(4, 'EARLY_TOPIC_MARKER budget question')

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(serverStream).toHaveBeenCalledTimes(1)
    const passedHistory = (serverStream.mock.calls[0][0] as { history: { role: string; content: string }[] }).history

    expect(passedHistory.some((m) => m.content.includes('[Conversation context'))).toBe(false)
    // Earlier messages preserved verbatim
    expect(passedHistory[0].content).toBe('EARLY_TOPIC_MARKER budget question')
    // Current-turn placeholders still excluded
    expect(passedHistory.some((m) => m.content === CURRENT_INPUT)).toBe(false)
  })
})

describe('chatService — F15(b) past-action outcomes carried in history', () => {
  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
    serverStream.mockResolvedValue(null)
  })

  const CURRENT_INPUT = 'generate a lunar calendar from this dataset'

  function historyPassed(): { role: string; content: string }[] {
    return (serverStream.mock.calls[0][0] as { history: { role: string; content: string }[] }).history
  }

  it('appends a compact outcome line for applied and rejected actions, no params leaked', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'clean then formula', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'Done.',
      timestamp: Date.now(),
      actions: [
        {
          id: 'a1b2c3d4-aaaa',
          tool: 'clear_sheet',
          params: { range: 'A1:Z99', secretValue: 'must-not-leak' },
          description: 'Clear the sheet',
          status: 'applied',
        },
        {
          id: 'c3d4e5f6-bbbb',
          tool: 'set_formula',
          params: { cell: 'B1', formula: '=SUM(A:A)' },
          description: 'Set formula',
          status: 'rejected',
        },
      ],
    })
    // Current-turn placeholders dropped by `.slice(0, -2)`
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(serverStream).toHaveBeenCalledTimes(1)
    const assistantTurn = historyPassed().find((m) => m.role === 'assistant')
    expect(assistantTurn?.content).toContain('[applied clear_sheet (a1b2); rejected set_formula (c3d4)]')
    // The original prose is preserved
    expect(assistantTurn?.content).toContain('Done.')
    // No action params leaked into history
    expect(assistantTurn?.content).not.toContain('must-not-leak')
    expect(assistantTurn?.content).not.toContain('SUM')
  })

  it('renders a pending turn as pending, never as applied', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'propose a chart', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'Here is a proposal.',
      timestamp: Date.now(),
      actions: [
        {
          id: '9999aaaa-bbbb',
          tool: 'create_chart',
          params: { type: 'bar' },
          description: 'Chart',
          status: 'pending',
        },
      ],
    })
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    const assistantTurn = historyPassed().find((m) => m.role === 'assistant')
    expect(assistantTurn?.content).toContain('[pending create_chart (9999)]')
    expect(assistantTurn?.content).not.toContain('applied')
  })

  it('leaves a no-action assistant turn unchanged', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'what is this sheet', timestamp: Date.now() })
    messages.push({ id: 'a0', role: 'assistant', content: 'It is a budget.', timestamp: Date.now() })
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    const assistantTurn = historyPassed().find((m) => m.content.includes('budget'))
    expect(assistantTurn?.content).toBe('It is a budget.')
    expect(assistantTurn?.content).not.toContain('[')
  })
})

describe('chatService — F15(d) insights scope-bound to workbook/sheet/revision', () => {
  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
    serverStream.mockResolvedValue(null)
  })

  const CURRENT_INPUT = 'generate a lunar calendar from this dataset'

  function priorInsightsArg(): unknown {
    // llmGateway builds a "Prior turn insights still apply" line into
    // context.deterministicSummary only when priorInsights is present.
    return (serverStream.mock.calls[0][0] as { context: { deterministicSummary?: string } }).context.deterministicSummary
  }

  it('reuses a snapshot whose scope matches the current sheet/revision', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'analyze', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'Analysis.',
      timestamp: Date.now(),
      insightsSnapshot: {
        insights: { totalIncome: 100 },
        scope: { workbookId: workbook.id, sheetId: workbook.activeSheetId, revision: 0 },
      },
    })
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(serverStream).toHaveBeenCalledTimes(1)
    expect(priorInsightsArg()).toContain('Prior turn insights still apply')
  })

  it('silently drops a snapshot from a different sheet (no priorInsights line)', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'analyze', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'Analysis.',
      timestamp: Date.now(),
      insightsSnapshot: {
        insights: { totalIncome: 100 },
        scope: { workbookId: workbook.id, sheetId: 'some-other-sheet', revision: 0 },
      },
    })
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(serverStream).toHaveBeenCalledTimes(1)
    expect(priorInsightsArg() ?? '').not.toContain('Prior turn insights still apply')
  })

  it('silently drops a legacy snapshot that predates the scope key', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'analyze', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'Analysis.',
      timestamp: Date.now(),
      // Legacy persisted shape: raw insights with no `scope` wrapper.
      insightsSnapshot: { totalIncome: 100 } as unknown as import('@/types').InsightsSnapshot,
    })
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(priorInsightsArg() ?? '').not.toContain('Prior turn insights still apply')
  })

  it('silently drops a snapshot from a stale revision', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'analyze', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'Analysis.',
      timestamp: Date.now(),
      insightsSnapshot: {
        insights: { totalIncome: 100 },
        scope: { workbookId: workbook.id, sheetId: workbook.activeSheetId, revision: 7 },
      },
    })
    messages.push({ id: 'current-user', role: 'user', content: CURRENT_INPUT, timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage(CURRENT_INPUT, 'stream-1', makeDeps())

    expect(priorInsightsArg() ?? '').not.toContain('Prior turn insights still apply')
  })
})

/**
 * Open-ended question baseline.
 *
 * Runs the real classifiers, parser and dispatcher against a small budget sheet
 * and checks that open-ended questions (judgment, interpretation, advice) reach
 * the model with the data they are about, and never change the sheet. This
 * measures routing and context, not answer quality — the server is mocked.
 */
describe('chatService — open-ended questions reach the model with relevant data', () => {
  const LLM_ANSWER = 'LLM_ANSWER_MARKER'

  interface SentRequest {
    message: string
    context: { deterministicSummary?: string; focusData?: string }
  }

  function seedBudgetSheet(): void {
    const rows: Array<Array<string | number>> = [
      ['Category', 'Budget', 'Actual', 'Notes'],
      ['Rent', 1200, 1200, 'fixed'],
      ['Groceries', 400, 450, 'weekly shop'],
      ['Entertainment', 200, 250, 'concerts'],
      ['Utilities', 150, 140, 'electric + water'],
      ['Transport', 100, 130, 'fuel'],
      ['Total'],
    ]
    const ctx = makeExecContext()
    rows.forEach((row, r) => row.forEach((value, c) => {
      ctx.setCellValue(`${String.fromCharCode(65 + c)}${r + 1}`, value)
    }))
    ctx.setCellValue('B7', null, '=SUM(B2:B6)')
    ctx.setCellValue('C7', null, '=SUM(C2:C6)')
  }

  function sentRequest(): SentRequest {
    return serverStream.mock.calls[0][0] as SentRequest
  }

  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
    serverStream.mockResolvedValue({ message: LLM_ANSWER, actions: [], source: 'llm' })
    seedBudgetSheet()
  })

  const OPEN_ENDED_QUESTIONS = [
    'Where am I overspending?',
    "What's my biggest expense and should I worry about it?",
    'I make $5000 a month, how much should I save?',
    'Explain my expenses',
    'Is the Actual column running above budget?',
    'Why is C7 higher than B7?',
    'What does the formula in B7 do?',
    'Walk me through what this sheet is for',
    'What stands out to you in this data?',
    'Is this budget realistic for a single person?',
    'What would you change about how this sheet is organized?',
    'Which categories should I keep an eye on next month?',
    'Can you explain the Notes column?',
    'Tell me about my spending habits',
    'Are there any mistakes in this spreadsheet?',
    'How could I make this more useful for tracking monthly trends?',
    'Give me your honest opinion of this budget',
    'What should I focus on first to improve my finances?',
    'Summarize this sheet in plain English',
    'Is my entertainment spending reasonable compared to everything else?',
  ]

  it.each(OPEN_ENDED_QUESTIONS)('"%s" reaches the model and leaves the sheet unchanged', async (question) => {
    const before = JSON.stringify(activeSheet().cells)

    const reply = await send(question)

    expect(serverStream).toHaveBeenCalledTimes(1)
    expect(reply?.content).toContain(LLM_ANSWER)
    expect(JSON.stringify(activeSheet().cells)).toBe(before)
  })

  it('passes the local budget analysis to the model for advice questions', async () => {
    await send('Where am I overspending?')

    expect(sentRequest().context.deterministicSummary).toMatch(/budget analysis/i)
  })

  it('attaches the values of a column named in the question', async () => {
    await send('Is the Actual column running above budget?')

    const focus = sentRequest().context.focusData ?? ''
    expect(focus).toContain('Actual')
    expect(focus).toContain('450')
    expect(focus).toContain('Groceries')
  })

  it('attaches the formula of a cell named in the question', async () => {
    await send('Why is C7 higher than B7?')

    const focus = sentRequest().context.focusData ?? ''
    expect(focus).toContain('=SUM(C2:C6)')
    expect(focus).toContain('=SUM(B2:B6)')
  })

  it('keeps the full insights write-up on follow-up turns', async () => {
    messages.push({ id: 'u0', role: 'user', content: 'explain this sheet', timestamp: Date.now() })
    messages.push({
      id: 'a0',
      role: 'assistant',
      content: 'It is a budget.',
      timestamp: Date.now(),
      insightsSnapshot: {
        insights: { totalIncome: 100 },
        scope: { workbookId: workbook.id, sheetId: workbook.activeSheetId, revision: 0 },
      },
    })
    messages.push({ id: 'current-user', role: 'user', content: 'Explain the totals again', timestamp: Date.now() })
    messages.push({ id: 'stream-1', role: 'assistant', content: '', timestamp: Date.now() })

    await processChatMessage('Explain the totals again', 'stream-1', makeDeps())

    const summary = sentRequest().context.deterministicSummary ?? ''
    expect(summary).toContain('Prior turn insights still apply')
    expect(summary).toContain('Deterministic sheet findings')
  })

  it('falls back to the local budget analysis when the model is unreachable', async () => {
    serverStream.mockResolvedValue(null)

    const reply = await send('Where am I overspending?')

    expect(reply?.content).toMatch(/spending|budget/i)
    expect(reply?.content).toContain('local analysis only')
    expect(reply?.content).not.toMatch(/^I couldn't reach the AI service/)
  })
})

describe('chatService — model-supplied metadata is stripped', () => {
  beforeEach(() => {
    workbook = createEmptyWorkbook('Chat Service Test')
    engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook)
    selection = null
    messages.length = 0
    serverStream.mockReset()
  })

  it('drops preview/scope/approval fields from model actions', async () => {
    serverStream.mockResolvedValue({
      message: 'I will set A1.',
      actions: [
        {
          tool: 'set_cell',
          params: {
            cell: 'A1',
            value: 42,
            previewChanges: [{ cell: 'A1', oldValue: null, newValue: 1 }],
            scope: { sheetId: 'somewhere-else' },
            confirmGaps: true,
          },
          description: 'Set A1',
        },
      ],
      source: 'llm',
    })

    const reply = await send('fill A1 with 42')

    expect(reply?.actions).toHaveLength(1)
    expect(reply?.actions?.[0].params).toEqual({ cell: 'A1', value: 42 })
  })
})

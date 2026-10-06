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
    renameSheet: () => {},
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

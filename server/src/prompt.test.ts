import { describe, it, expect } from 'vitest'
import { buildActionPrompt, buildExplainPrompt, type SpreadsheetContextInput } from './prompt.js'
import { FEW_SHOT_EXAMPLES, buildFewShotMessages } from './prompts/index.js'

const context: SpreadsheetContextInput = {
  workbookName: 'Budget',
  activeSheet: 'Sheet1',
  sheetNames: ['Sheet1'],
  selectedCells: [],
  sampleRows: Array.from({ length: 60 }, (_, i) => [`item${i}`, String(i)]),
}

describe('formatContextBlock via buildActionPrompt', () => {
  it('treats a zero context budget as zero, not unlimited', () => {
    expect(buildActionPrompt(context, 0)).not.toContain('Data preview')
    expect(buildActionPrompt(context, 0)).toContain('[context truncated')
  })

  it('notes truncation when more than 50 sample rows were sent', () => {
    const prompt = buildActionPrompt(context)
    expect(prompt).toContain('Row 50:')
    expect(prompt).not.toContain('Row 51:')
    expect(prompt).toContain('Data preview is truncated')
  })

  it('puts focus data for the question ahead of the lossy snapshot', () => {
    const prompt = buildExplainPrompt({ ...context, focusData: 'C7 (Actual) = 1170 (formula: =SUM(C2:C6))' }, 'explain')
    expect(prompt).toContain('C7 (Actual) = 1170')
    expect(prompt.indexOf('Exact data for what the question names')).toBeLessThan(prompt.indexOf('Data preview'))
  })

  it('keeps truncated focus data rather than dropping it under a tight budget', () => {
    const focusData = Array.from({ length: 400 }, (_, i) => `  Row ${i + 2}: Amount=${i}`).join('\n')
    const prompt = buildExplainPrompt({ ...context, focusData }, 'explain', undefined, 400)
    expect(prompt).toContain('Row 2: Amount=0')
    expect(prompt).not.toContain('Row 401: Amount=399')
    expect(prompt).toContain('[context truncated')
  })
})

describe('buildFewShotMessages', () => {
  it('tags every example turn so trimming the oldest ones never leaves the rest unlabeled', () => {
    const messages = buildFewShotMessages(FEW_SHOT_EXAMPLES)
    const examples = messages.slice(0, -1)
    expect(examples).toHaveLength(FEW_SHOT_EXAMPLES.length)
    for (const m of examples.filter((m) => m.role === 'user')) {
      expect(m.content.startsWith('[Style example')).toBe(true)
    }
    expect(messages.at(-1)).toMatchObject({ role: 'system' })
    expect(messages.at(-1)!.content).toMatch(/never reuse their numbers/)
  })

  it('adds nothing when there are no examples', () => {
    expect(buildFewShotMessages([])).toEqual([])
  })

  it('contains no tool-call JSON, which explain/advise/chat replies must never emit', () => {
    expect(FEW_SHOT_EXAMPLES.some((m) => /"actions"\s*:/.test(m.content))).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { buildActionPrompt, type SpreadsheetContextInput } from './prompt.js'

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
})

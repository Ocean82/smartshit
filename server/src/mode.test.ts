import { describe, expect, it } from 'vitest'
import { classifyMode, isLlmOnlyMode, getHelpResponse } from './mode.js'

describe('classifyMode', () => {
  it('classifies explain before expense creation keywords', () => {
    expect(classifyMode('Explain my expenses')).toBe('explain')
    expect(classifyMode('What does this budget mean?')).toBe('explain')
    expect(classifyMode('Summarize my spending')).toBe('explain')
  })

  it('classifies financial advice requests', () => {
    expect(classifyMode('Where am I losing money?')).toBe('advise')
    expect(classifyMode('How much should I save each month?')).toBe('advise')
    expect(classifyMode('I need help with savings')).toBe('advise')
  })

  it('classifies creation requests as act', () => {
    expect(classifyMode('Build a monthly budget')).toBe('act')
    expect(classifyMode('Create a sales tracker')).toBe('act')
    expect(classifyMode('Make an invoice template')).toBe('act')
  })

  it('classifies common spreadsheet imperatives as act', () => {
    expect(classifyMode('set A1 to 100')).toBe('act')
    expect(classifyMode('count how many are overdue')).toBe('act')
    expect(classifyMode('export this as CSV')).toBe('act')
    expect(classifyMode('remove Netflix')).toBe('act')
    expect(classifyMode('delete row Netflix')).toBe('act')
    expect(classifyMode('sort my data')).toBe('act')
  })

  it('keeps question-framed act keywords out of act mode', () => {
    expect(classifyMode('can you set A1 to 100?')).toBe('chat')
    expect(classifyMode('should I remove Netflix?')).toBe('chat')
  })

  it('classifies help requests', () => {
    expect(classifyMode('help')).toBe('help')
    expect(classifyMode('What can you do?')).toBe('help')
  })

  it('defaults to chat for open conversation', () => {
    expect(classifyMode('thanks!')).toBe('chat')
    expect(classifyMode('hello')).toBe('chat')
  })

  it('classifies unusual-value follow-ups as explain', () => {
    expect(classifyMode('what makes those values unusual')).toBe('explain')
    expect(classifyMode('why are these unusual')).toBe('explain')
  })
})

describe('isLlmOnlyMode', () => {
  it('returns true for explain, advise, and chat', () => {
    expect(isLlmOnlyMode('explain')).toBe(true)
    expect(isLlmOnlyMode('advise')).toBe(true)
    expect(isLlmOnlyMode('chat')).toBe(true)
    expect(isLlmOnlyMode('act')).toBe(false)
    expect(isLlmOnlyMode('help')).toBe(false)
  })
})

describe('getHelpResponse', () => {
  it('returns non-empty guidance', () => {
    expect(getHelpResponse()).toContain('Explain my expenses')
    expect(getHelpResponse()).toContain('Build a monthly budget')
  })
})

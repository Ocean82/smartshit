import { describe, expect, it } from 'vitest'
import { parseUserIntent, isQueryIntent } from './intentParser'

describe('shared parseUserIntent', () => {
  it('routes top-N expense queries to filter intent', () => {
    const intent = parseUserIntent('Show top 5 expenses')
    expect(intent.intentType).toBe('filter')
    expect(intent.parameters.n).toBe(5)
    expect(isQueryIntent(intent)).toBe(true)
  })

  it('keeps budget intent for explain expenses without top-N', () => {
    const intent = parseUserIntent('Explain my expenses')
    expect(intent.intentType).toBe('budget')
  })

  it('prioritizes an explicit comparison over tied domain keywords', () => {
    const intent = parseUserIntent('Compare January and February expenses')
    expect(intent.intentType).toBe('compare')
    expect(isQueryIntent(intent)).toBe(true)
  })
})

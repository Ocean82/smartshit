import { describe, expect, it } from 'vitest'
import { parseUserIntent } from './intentParser'

describe('parseUserIntent', () => {
  it('extracts top N from expense query as filter intent', () => {
    const intent = parseUserIntent('Show top 5 expenses')
    expect(intent.parameters.n).toBe(5)
    expect(intent.intentType).toBe('filter')
  })

  it('detects sort descending on column B', () => {
    const intent = parseUserIntent('Sort column B descending')
    expect(intent.intentType).toBe('sort')
    expect(intent.parameters.ascending).toBe(false)
  })
})

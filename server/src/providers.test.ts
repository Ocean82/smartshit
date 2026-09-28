/**
 * Tests for provider failover acceptance rules.
 *
 * A provider call can return HTTP 200 and still carry no content — a reasoning
 * model that spends its whole output budget on reasoning, or a provider that
 * stops before emitting. That must count as a failure so the chain keeps
 * failing over, instead of ending on a blank answer the user is told to fix by
 * rephrasing.
 */
import { describe, expect, it } from 'vitest'
import { isUsableCompletion } from './providers.js'

describe('isUsableCompletion', () => {
  it('rejects an empty string', () => {
    expect(isUsableCompletion('')).toBe(false)
  })

  it('rejects a whitespace-only completion', () => {
    // A reasoning model that burns its whole budget can leave pure whitespace.
    expect(isUsableCompletion('   \n\t  ')).toBe(false)
  })

  it('rejects a missing or non-string value', () => {
    expect(isUsableCompletion(null)).toBe(false)
    expect(isUsableCompletion(undefined)).toBe(false)
  })

  it('accepts real content, preserving surrounding whitespace', () => {
    expect(isUsableCompletion(' Labor_Model holds 1000 rows. ')).toBe(true)
  })

  it('accepts content that is only a thinking tag boundary remnant', () => {
    // Not empty, so it is the parser's concern downstream, not the failover's.
    expect(isUsableCompletion('</think>')).toBe(true)
  })
})

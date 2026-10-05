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
import { isUsableCompletion, isTerminalFinish } from './providers.js'

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

/**
 * Terminal finish-reason gate (F11d).
 *
 * A completion that stops on 'length' was truncated at the output cap; a
 * missing/null reason means the provider never confirmed a clean stop. Both are
 * treated as provider failures so the loop fails over rather than parsing a
 * cut-off response as if it were whole.
 */
describe('isTerminalFinish', () => {
  it('rejects a truncation (length) completion', () => {
    expect(isTerminalFinish('length')).toBe(false)
  })

  it('rejects a missing terminal reason', () => {
    expect(isTerminalFinish(null)).toBe(false)
  })

  it('accepts a clean stop', () => {
    expect(isTerminalFinish('stop')).toBe(true)
  })

  it('accepts provider-specific terminal synonyms', () => {
    expect(isTerminalFinish('end_turn')).toBe(true)
    expect(isTerminalFinish('eos')).toBe(true)
    expect(isTerminalFinish('STOP')).toBe(true) // case-insensitive
  })

  it('rejects an unknown non-terminal reason', () => {
    expect(isTerminalFinish('content_filter')).toBe(false)
  })
})

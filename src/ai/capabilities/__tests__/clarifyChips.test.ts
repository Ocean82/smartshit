import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_SKIP_PREFIX,
  CAPABILITY_SOMETHING_ELSE_LABEL,
  capabilitySkipMessage,
  capabilityPickMessage,
  isCapabilitySkipMessage,
  isCapabilityPickMessage,
  parseCapabilityPickMessage,
  stripCapabilitySkipPrefix,
  suggestionChipLabel,
} from '@/ai/capabilities/clarifyChips'

describe('clarifyChips', () => {
  it('encodes and strips skip prefix', () => {
    const encoded = capabilitySkipMessage('make this look nicer')
    expect(isCapabilitySkipMessage(encoded)).toBe(true)
    expect(stripCapabilitySkipPrefix(encoded)).toBe('make this look nicer')
    expect(suggestionChipLabel(encoded)).toBe(CAPABILITY_SOMETHING_ELSE_LABEL)
  })

  it('encodes pick with NL label separate from capability id', () => {
    const encoded = capabilityPickMessage('format_as_table', 'Format this as a table')
    expect(isCapabilityPickMessage(encoded)).toBe(true)
    expect(parseCapabilityPickMessage(encoded)).toEqual({
      capabilityId: 'format_as_table',
      label: 'Format this as a table',
    })
    expect(suggestionChipLabel(encoded)).toBe('Format this as a table')
    expect(encoded.includes('format_as_table')).toBe(true)
    // UI must never show raw id as the only chip text
    expect(suggestionChipLabel(encoded)).not.toBe('format_as_table')
  })

  it('leaves normal suggestions unchanged', () => {
    expect(suggestionChipLabel('Format this as a table')).toBe('Format this as a table')
    expect(isCapabilitySkipMessage('Format this as a table')).toBe(false)
  })

  it('uses a stable skip prefix', () => {
    expect(CAPABILITY_SKIP_PREFIX).toContain('capability-skip:')
  })
})

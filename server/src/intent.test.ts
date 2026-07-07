import { describe, expect, it } from 'vitest'
import { resolveIntent } from './intent.js'
import { classifyMode } from './mode.js'

describe('resolveIntent with mode gating', () => {
  it('does not create templates for explain requests', () => {
    const result = resolveIntent('Explain my expenses')
    expect(classifyMode('Explain my expenses')).toBe('explain')
    expect(result.actions).toHaveLength(0)
    expect(result.message).toBe('')
  })

  it('does not create templates for advise requests', () => {
    const result = resolveIntent('Where am I losing money?')
    expect(result.actions).toHaveLength(0)
  })

  it('still fast-paths budget creation in act mode', () => {
    const result = resolveIntent('Build a monthly budget')
    expect(classifyMode('Build a monthly budget')).toBe('act')
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.tool).toBe('create_budget_template')
  })

  it('returns help text for help mode', () => {
    const result = resolveIntent('help')
    expect(result.actions).toHaveLength(0)
    expect(result.message).toContain('Explain my expenses')
  })

  it('does not return analyze_data actions', () => {
    const result = resolveIntent('Analyze my sheet')
    expect(result.actions.every((a) => a.tool !== 'analyze_data')).toBe(true)
  })
})

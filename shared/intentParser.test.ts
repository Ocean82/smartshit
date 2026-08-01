import { describe, expect, it } from 'vitest'
import { parseUserIntent, isQueryIntent, serializeIntent, deserializeIntent } from './intentParser'
import type { UserIntent, IntentDeserializationError } from './intentTypes'

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


describe('serializeIntent', () => {
  it('serializes all required fields', () => {
    const intent: UserIntent = {
      intentType: 'filter',
      targetColumns: ['A', 'B'],
      filters: { amount: { gt: 500 } },
      parameters: { n: 5 },
      rawQuery: 'show top 5',
      confidence: 0.85,
    }
    const json = serializeIntent(intent)
    const parsed = JSON.parse(json)
    expect(parsed.intentType).toBe('filter')
    expect(parsed.targetColumns).toEqual(['A', 'B'])
    expect(parsed.filters).toEqual({ amount: { gt: 500 } })
    expect(parsed.parameters).toEqual({ n: 5 })
    expect(parsed.rawQuery).toBe('show top 5')
    expect(parsed.confidence).toBe(0.85)
  })

  it('omits undefined optional fields from output', () => {
    const intent: UserIntent = {
      intentType: 'read',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'read data',
      confidence: 0.7,
    }
    const json = serializeIntent(intent)
    const parsed = JSON.parse(json)
    expect(parsed).not.toHaveProperty('targetSheet')
    expect(parsed).not.toHaveProperty('targetRows')
    expect(parsed).not.toHaveProperty('routingSource')
    expect(parsed).not.toHaveProperty('entities')
    expect(parsed).not.toHaveProperty('unresolvedEntities')
  })

  it('includes optional fields when defined', () => {
    const intent: UserIntent = {
      intentType: 'filter',
      targetSheet: 'Sheet1',
      targetColumns: ['C'],
      targetRows: '1-10',
      filters: {},
      parameters: {},
      rawQuery: 'filter sheet1',
      confidence: 0.9,
      routingSource: 'nlp',
    }
    const json = serializeIntent(intent)
    const parsed = JSON.parse(json)
    expect(parsed.targetSheet).toBe('Sheet1')
    expect(parsed.targetRows).toBe('1-10')
    expect(parsed.routingSource).toBe('nlp')
  })
})

describe('deserializeIntent', () => {
  it('successfully deserializes valid JSON', () => {
    const intent: UserIntent = {
      intentType: 'analyze',
      targetColumns: ['A'],
      filters: { x: 1 },
      parameters: { deep: true },
      rawQuery: 'analyze column A',
      confidence: 0.92,
    }
    const json = serializeIntent(intent)
    const result = deserializeIntent(json)
    expect(result).not.toHaveProperty('success')
    expect((result as UserIntent).intentType).toBe('analyze')
    expect((result as UserIntent).targetColumns).toEqual(['A'])
    expect((result as UserIntent).confidence).toBe(0.92)
  })

  it('returns parse_failure for invalid JSON', () => {
    const result = deserializeIntent('not json at all') as IntentDeserializationError
    expect(result.success).toBe(false)
    expect(result.error).toBe('parse_failure')
    expect(result.raw).toBe('not json at all')
  })

  it('returns schema_validation_failure for missing intentType', () => {
    const json = JSON.stringify({ rawQuery: 'test', confidence: 0.5, targetColumns: [], filters: {}, parameters: {} })
    const result = deserializeIntent(json) as IntentDeserializationError
    expect(result.success).toBe(false)
    expect(result.error).toBe('schema_validation_failure')
    expect(result.message).toContain('intentType')
  })

  it('returns schema_validation_failure for missing confidence', () => {
    const json = JSON.stringify({ intentType: 'read', rawQuery: 'test', targetColumns: [], filters: {}, parameters: {} })
    const result = deserializeIntent(json) as IntentDeserializationError
    expect(result.success).toBe(false)
    expect(result.error).toBe('schema_validation_failure')
    expect(result.message).toContain('confidence')
  })

  it('returns schema_validation_failure for invalid intentType', () => {
    const json = JSON.stringify({ intentType: 'invalid_type', rawQuery: 'test', confidence: 0.5, targetColumns: [], filters: {}, parameters: {} })
    const result = deserializeIntent(json) as IntentDeserializationError
    expect(result.success).toBe(false)
    expect(result.error).toBe('schema_validation_failure')
    expect(result.message).toContain('invalid_type')
  })

  it('returns schema_validation_failure for confidence out of range', () => {
    const json = JSON.stringify({ intentType: 'read', rawQuery: 'test', confidence: 1.5, targetColumns: [], filters: {}, parameters: {} })
    const result = deserializeIntent(json) as IntentDeserializationError
    expect(result.success).toBe(false)
    expect(result.error).toBe('schema_validation_failure')
    expect(result.message).toContain('confidence')
  })

  it('returns schema_validation_failure for non-object JSON', () => {
    const result = deserializeIntent('"just a string"') as IntentDeserializationError
    expect(result.success).toBe(false)
    expect(result.error).toBe('schema_validation_failure')
  })

  it('round-trips a full UserIntent with optional fields', () => {
    const intent: UserIntent = {
      intentType: 'sort',
      targetSheet: 'Budget',
      targetColumns: ['Amount', 'Date'],
      targetRows: '1-50',
      filters: { category: 'food' },
      parameters: { ascending: true },
      rawQuery: 'sort by amount ascending',
      confidence: 0.95,
      routingSource: 'regex',
    }
    const result = deserializeIntent(serializeIntent(intent)) as UserIntent
    expect(result).toEqual(intent)
  })

  it('round-trips a minimal UserIntent (no optional fields)', () => {
    const intent: UserIntent = {
      intentType: 'unknown',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: '',
      confidence: 0,
    }
    const result = deserializeIntent(serializeIntent(intent)) as UserIntent
    expect(result.intentType).toBe('unknown')
    expect(result.targetSheet).toBeUndefined()
    expect(result.targetRows).toBeUndefined()
    expect(result.routingSource).toBeUndefined()
    expect(result.entities).toBeUndefined()
    expect(result.unresolvedEntities).toBeUndefined()
  })
})

/**
 * Model-output sanitising for action parameters.
 *
 * Regression coverage for the reproduced defect: a model action carrying
 * `previewChanges: []` satisfied the script "has a preview" check and executed
 * on the first Apply, bypassing the claimed review of what that click would do.
 */

import { describe, expect, it } from 'vitest'
import { isModelUntrustedParamKey, sanitizeActionParams } from './actionParams'

describe('sanitizeActionParams', () => {
  it('keeps legitimate tool parameters untouched', () => {
    const params = {
      cell: 'A1',
      value: 100,
      formula: '=SUM(B1:B2)',
      column: 'B',
      operation: 'multiply',
      factor: 1.1,
      rules: [{ column: 'A', direction: 'asc' }],
      nested: { keep: true },
    }
    expect(sanitizeActionParams(params)).toEqual(params)
  })

  it('strips preview and approval metadata', () => {
    const clean = sanitizeActionParams({
      code: 'setCell("A1", 1)',
      previewChanges: [],
      preview: { changes: [] },
      scope: { sheetId: 'other' },
      prepared: { kind: 'script' },
      patch: {},
      signature: 'abc',
      expectedRowSignature: 'abc',
      approval: true,
      approved: true,
      approvedBy: 'model',
      reviewed: true,
      reviewedAt: 123,
      confirmGaps: true,
      status: 'applied',
      state: 'applied',
    })
    expect(clean).toEqual({ code: 'setCell("A1", 1)' })
  })

  it('treats non-object params as empty', () => {
    expect(sanitizeActionParams(undefined)).toEqual({})
    expect(sanitizeActionParams(null)).toEqual({})
    expect(sanitizeActionParams('nope')).toEqual({})
    expect(sanitizeActionParams([1, 2])).toEqual({})
  })

  it('does not mutate the input', () => {
    const params = { code: 'x', previewChanges: [] }
    sanitizeActionParams(params)
    expect(params.previewChanges).toEqual([])
  })
})

describe('isModelUntrustedParamKey', () => {
  it('flags the keys that decide whether a change is safe', () => {
    for (const key of ['previewChanges', 'preview', 'scope', 'prepared', 'signature', 'confirmGaps']) {
      expect(isModelUntrustedParamKey(key), key).toBe(true)
    }
  })

  it('does not flag ordinary tool parameters', () => {
    for (const key of ['cell', 'value', 'formula', 'column', 'operation', 'factor', 'code', 'theme']) {
      expect(isModelUntrustedParamKey(key), key).toBe(false)
    }
  })
})

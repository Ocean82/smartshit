/**
 * Tests for tool-parameter validation against the registry (F11).
 */
import { describe, expect, it } from 'vitest'
import { validateToolParams } from './validateToolParams.js'

describe('validateToolParams', () => {
  it('accepts a well-formed action', () => {
    expect(validateToolParams('set_cell', { cell: 'A1', value: '100' }).valid).toBe(true)
  })

  it('rejects a missing required param', () => {
    const result = validateToolParams('set_cell', { value: '100' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('cell')
  })

  it('treats a null required param as absent', () => {
    expect(validateToolParams('set_cell', { cell: null, value: '100' }).valid).toBe(false)
  })

  it('rejects a required param of the wrong type', () => {
    // modify_column.factor is declared number — a string must be rejected.
    const result = validateToolParams('modify_column', {
      column: 'B',
      operation: 'multiply',
      factor: '2',
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('factor')
  })

  it('rejects NaN for a number param', () => {
    expect(
      validateToolParams('set_column_width', { column: 'B', width: Number.NaN }).valid,
    ).toBe(false)
  })

  it('rejects an array where an object is required and vice versa', () => {
    // set_range.values is declared array — an object must be rejected.
    expect(validateToolParams('set_range', { startCell: 'A1', values: {} }).valid).toBe(false)
    // format_cells.condition is declared object — an array must be rejected.
    expect(validateToolParams('format_cells', { condition: [] }).valid).toBe(false)
  })

  it('accepts an action that omits optional params', () => {
    // execute_script: only `code` is required; `description` is optional.
    expect(validateToolParams('execute_script', { code: 'setCell("A1", 1)' }).valid).toBe(true)
  })

  it('tolerates unknown extra keys (dangerous ones are stripped upstream)', () => {
    expect(
      validateToolParams('set_cell', { cell: 'A1', value: '1', somethingElse: true }).valid,
    ).toBe(true)
  })

  it('does not reject an unknown tool (name allowlisting is a separate gate)', () => {
    expect(validateToolParams('not_a_real_tool', { foo: 1 }).valid).toBe(true)
  })
})

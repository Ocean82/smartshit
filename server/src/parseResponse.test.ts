/**
 * Model-output parsing.
 *
 * Regression coverage for the reproduced defect: the action parser passed tool
 * parameters through largely unchanged, so a model-supplied
 * `previewChanges: []` reached the client and satisfied the script dry-run gate.
 */

import { describe, expect, it } from 'vitest'
import { parseAgentResponse } from './parseResponse.js'

function parse(actions: unknown[], message = 'Doing the thing') {
  return parseAgentResponse(JSON.stringify({ message, actions }))
}

describe('parseAgentResponse — parameter sanitising', () => {
  it('keeps legitimate tool parameters', () => {
    const { actions } = parse([
      { tool: 'set_range', params: { startCell: 'A1', values: [[1, 2]] }, description: 'Write' },
    ])
    expect(actions).toEqual([
      { tool: 'set_range', params: { startCell: 'A1', values: [[1, 2]] }, description: 'Write' },
    ])
  })

  it('strips preview, signature, approval and execution-state fields', () => {
    const { actions } = parse([
      {
        tool: 'execute_script',
        params: {
          code: 'setCell("A1", 999)',
          previewChanges: [],
          preview: { changes: [] },
          signature: 'forged',
          scope: { sheetId: 'elsewhere' },
          confirmGaps: true,
          status: 'applied',
        },
        description: 'Update a cell',
      },
    ])
    expect(actions).toHaveLength(1)
    expect(actions[0].params).toEqual({ code: 'setCell("A1", 999)' })
  })

  it('still filters unknown tools and defaults the description', () => {
    const { actions } = parse([
      { tool: 'not_a_tool', params: { a: 1 } },
      { tool: 'clear_sheet' },
    ])
    expect(actions).toEqual([
      { tool: 'clear_sheet', params: {}, description: 'Run clear_sheet' },
    ])
  })
})

describe('parseAgentResponse — parameter contract validation (F11)', () => {
  it('drops an action missing a required param', () => {
    // set_cell requires both cell and value; this one omits value.
    const { actions } = parse([
      { tool: 'set_cell', params: { cell: 'A1' }, description: 'Set a cell' },
    ])
    expect(actions).toHaveLength(0)
  })

  it('drops an action whose param has the wrong type', () => {
    // modify_column.factor must be a number.
    const { actions } = parse([
      { tool: 'modify_column', params: { column: 'B', operation: 'multiply', factor: 'two' }, description: 'x2' },
    ])
    expect(actions).toHaveLength(0)
  })

  it('keeps valid actions alongside dropped invalid ones', () => {
    const { actions } = parse([
      { tool: 'set_cell', params: { cell: 'A1', value: '100' }, description: 'ok' },
      { tool: 'set_cell', params: { value: 'orphan' }, description: 'bad' },
    ])
    expect(actions).toHaveLength(1)
    expect(actions[0].params).toEqual({ cell: 'A1', value: '100' })
  })

  it('still accepts a valid execute_script (description is not a required param)', () => {
    const { actions } = parse([
      { tool: 'execute_script', params: { code: 'setCell("A1", 1)' }, description: 'run it' },
    ])
    expect(actions).toHaveLength(1)
  })
})

describe('parseAgentResponse — parseStatus discriminator (F11c)', () => {
  it('marks a well-formed empty-actions clarification as parsed', () => {
    // An intentional clarification question is valid output, NOT a parse
    // failure — it must not trigger the repair retry.
    const result = parseAgentResponse(JSON.stringify({ message: 'Which column?', actions: [] }))
    expect(result.parseStatus).toBe('parsed')
    expect(result.actions).toEqual([])
    expect(result.message).toBe('Which column?')
  })

  it('marks a well-formed response with actions as parsed', () => {
    const result = parseAgentResponse(
      JSON.stringify({ message: 'Done', actions: [{ tool: 'clear_sheet' }] }),
    )
    expect(result.parseStatus).toBe('parsed')
    expect(result.actions).toHaveLength(1)
  })

  it('marks a prose blob (no JSON object) as unparsed', () => {
    const result = parseAgentResponse('I can help you build a budget. What categories do you track?')
    expect(result.parseStatus).toBe('unparsed')
    expect(result.actions).toEqual([])
  })

  it('marks a response with no closing brace as unparsed (extraction fails)', () => {
    const result = parseAgentResponse('{"message":"half a resp')
    expect(result.parseStatus).toBe('unparsed')
    expect(result.actions).toEqual([])
  })

  it('marks a malformed JSON object as unparsed (JSON.parse throws)', () => {
    // Extraction finds a `{...}` slice, but it is not valid JSON.
    const result = parseAgentResponse('{"message": "x", actions: [}')
    expect(result.parseStatus).toBe('unparsed')
    expect(result.actions).toEqual([])
  })
})

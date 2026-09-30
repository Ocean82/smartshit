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

import { describe, expect, it } from 'vitest'
import { classifyMode } from './mode.js'
import { resolveIntent } from './intent.js'
import { parseAgentResponse } from './parseResponse.js'

describe('chat request and action safety', () => {
  it.each([
    'do not set A1 to 100',
    'explain how to set A1 to 100',
    'please don’t clear the sheet',
    'what if I delete all data',
  ])('treats %s as read-only before template routing', message => {
    expect(classifyMode(message)).toBe('explain')
    expect(resolveIntent(message).actions).toEqual([])
  })

  it('does not turn a blank-cell formula request into a clear-sheet action', () => {
    expect(resolveIntent('create a formula to fill blank cells with zero').actions.some(a => a.tool === 'clear_sheet')).toBe(false)
  })

  it.each(['clear sheet', 'clear all data', 'reset the sheet', 'start over'])('still recognizes explicit clear request: %s', message => {
    expect(resolveIntent(message).actions[0]?.tool).toBe('clear_sheet')
  })

  it('removes model-supplied approval fields without discarding proposed code', () => {
    const result = parseAgentResponse(JSON.stringify({ message: 'Review', actions: [{ tool: 'execute_script', params: {
      code: 'setCell("A1",999)', previewChanges: [], preview: {}, confirmGaps: true, expectedRowSignature: 'fake', scope: { approved: true }, status: 'applied', approved: true, steps: [{ tool: 'clean_sheet_data', params: { preview: { changes: [] }, expectedRowSignature: 'fake' } }],
    } }] }))
    expect(result.actions[0].params).toEqual({ code: 'setCell("A1",999)', steps: [{ tool: 'clean_sheet_data', params: {} }] })
  })

  it('does not accept array params as a parameter object', () => {
    const result = parseAgentResponse('{"message":"Review","actions":[{"tool":"set_cell","params":["A1",1]}]}')
    expect(result.actions[0].params).toEqual({})
  })
})

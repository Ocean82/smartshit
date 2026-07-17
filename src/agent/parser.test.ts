import { describe, expect, it } from 'vitest'
import { parseMessage } from './parser'

describe('parseMessage — format/color intents', () => {
  it('routes "change the text to red" to format_cells fontColor (not find/replace)', () => {
    const result = parseMessage('change the text to red')
    expect(result.understood).toBe(true)
    expect(result.calls).toHaveLength(1)
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.fontColor).toBe('#FF0000')
  })

  it('routes "make text blue" to format_cells fontColor', () => {
    const result = parseMessage('make text blue')
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.fontColor).toBe('#0000FF')
  })

  it('parses "highlight cells containing 4" as a contains condition', () => {
    const result = parseMessage('highlight cells containing 4')
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.condition).toEqual({ operator: 'contains', value: '4' })
    expect(result.calls[0].params.bgColor).toBeTruthy()
  })

  it('parses "identify cells that contain the number 4 and highlight that cell"', () => {
    const result = parseMessage('identify cells that contain the number 4 and highlight that cell')
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.condition).toEqual({ operator: 'contains', value: '4' })
  })

  it('uses the requested highlight color: "highlight cells with 4 in red"', () => {
    const result = parseMessage('highlight cells with 4 in red')
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.condition).toEqual({ operator: 'contains', value: '4' })
    expect(result.calls[0].params.bgColor).toBe('#FEE2E2')
  })

  it('parses "highlight cells equal to 4" as a numeric eq condition', () => {
    const result = parseMessage('highlight cells equal to 4')
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.condition).toEqual({ operator: 'eq', value: 4 })
  })

  it('still highlights negatives, without firing on unrelated red requests', () => {
    const result = parseMessage('highlight negative values in column D')
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.range).toBe('D')
    expect(result.calls[0].params.condition).toEqual({ operator: 'negative' })
  })

  it('keeps genuine find/replace working', () => {
    const result = parseMessage('replace all TBD with Pending')
    expect(result.calls[0].tool).toBe('find_and_replace')
    expect(result.calls[0].params).toMatchObject({ find: 'tbd', replace: 'pending' })
  })

  it('does not emit find_and_replace when the target is a color word', () => {
    const result = parseMessage('change everything to red')
    const tools = result.calls.map((c) => c.tool)
    expect(tools).not.toContain('find_and_replace')
  })

  it('bolds the header row using sheet context', () => {
    const result = parseMessage('bold the headers', {
      headerRow: 2,
      lastDataRow: 10,
      lastDataCol: 3,
      headers: ['Name', 'Amount'],
    })
    expect(result.calls[0].tool).toBe('format_cells')
    expect(result.calls[0].params.range).toBe('A3:Z3')
    expect(result.calls[0].params.bold).toBe(true)
  })
})

describe('parseMessage — existing behavior stays intact', () => {
  it('parses set cell', () => {
    const result = parseMessage('put 500 in B3')
    expect(result.calls[0].tool).toBe('set_cell')
    expect(result.calls[0].params).toMatchObject({ cell: 'B3', value: '500' })
  })

  it('parses sort', () => {
    const result = parseMessage('sort by column B highest first')
    expect(result.calls[0].tool).toBe('sort_sheet')
    expect(result.calls[0].params).toMatchObject({ column: 'B', direction: 'desc' })
  })

  it('returns understood false for open-ended questions', () => {
    const result = parseMessage('what should I do about my budget?')
    expect(result.understood).toBe(false)
  })
})

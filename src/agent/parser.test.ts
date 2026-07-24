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

/**
 * Regression cases from the 2026-07-24 review — see
 * docs/agent-engine-code-review.md (M1). The fast path must not hijack
 * messages it cannot handle correctly: returning `understood: false` lets the
 * request reach the LLM instead of silently mutating the wrong data.
 */
describe('parseMessage — does not hijack unrelated phrasing', () => {
  it('ignores "sort" appearing inside another word', () => {
    // Previously parsed as sort_sheet on column "T", scraped out of "the"
    expect(parseMessage('resort the data').understood).toBe(false)
    expect(parseMessage('assorted expenses').understood).toBe(false)
  })

  it('does not treat operational deletes as row deletions', () => {
    for (const message of [
      'remove formatting',
      'remove all the duplicate rows',
      'delete empty rows',
      'remove the filters',
    ]) {
      expect(parseMessage(message).understood, message).toBe(false)
    }
  })

  it('does not guess a column when the sort target is ambiguous', () => {
    expect(parseMessage('sort').understood).toBe(false)
    expect(parseMessage('sort the sheet').understood).toBe(false)
  })
})

describe('parseMessage — column and phrasing coverage', () => {
  it('sorts by a header name', () => {
    const result = parseMessage('sort by amount highest first')
    expect(result.calls[0].tool).toBe('sort_sheet')
    expect(result.calls[0].params).toMatchObject({ column: 'amount', direction: 'desc' })
  })

  it('prefers an exact header from sheet context', () => {
    const result = parseMessage('sort by amount', {
      headerRow: 0,
      lastDataRow: 5,
      lastDataCol: 2,
      headers: ['Item', 'Amount'],
    })
    expect(result.calls[0].params).toMatchObject({ column: 'Amount' })
  })

  it('handles multi-letter columns', () => {
    expect(parseMessage('sort by column AA').calls[0].params).toMatchObject({ column: 'AA' })
    expect(parseMessage('sum column AA').calls[0].params).toMatchObject({ cell: 'AA' })
  })

  it('supports "set <cell> to <value>" phrasing', () => {
    const result = parseMessage('set A1 to 5')
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('set_cell')
    expect(result.calls[0].params).toMatchObject({ cell: 'A1', value: '5' })
  })

  it('still deletes a named row', () => {
    const result = parseMessage('remove Netflix')
    expect(result.understood).toBe(true)
    expect(result.calls[0].tool).toBe('delete_row')
  })
})

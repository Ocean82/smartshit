/**
 * Server/client act-template resolution.
 *
 * Regression coverage for the reproduced defect: the destructive `clear_sheet`
 * rule matched the bare word `blank` anywhere, so
 * "create a formula to fill blank cells with zero" resolved to a sheet wipe.
 */

import { describe, expect, it } from 'vitest'
import { resolveActTemplates } from './actTemplates'

function toolOf(message: string): string | undefined {
  return resolveActTemplates(message).actions[0]?.tool
}

describe('resolveActTemplates — clear_sheet matching', () => {
  it('still matches an explicit wipe of the sheet', () => {
    expect(toolOf('clear the sheet')).toBe('clear_sheet')
    expect(toolOf('clear everything')).toBe('clear_sheet')
    expect(toolOf('reset the sheet')).toBe('clear_sheet')
    expect(toolOf('start over')).toBe('clear_sheet')
    expect(toolOf('blank out the sheet')).toBe('clear_sheet')
    expect(toolOf('wipe this tab')).toBe('clear_sheet')
    expect(toolOf('erase the whole spreadsheet')).toBe('clear_sheet')
  })

  it('does not match requests about blank cells', () => {
    expect(toolOf('create a formula to fill blank cells with zero')).not.toBe('clear_sheet')
    expect(toolOf('fill blank cells with 0')).not.toBe('clear_sheet')
    expect(toolOf('replace blank values with a dash')).not.toBe('clear_sheet')
    expect(toolOf('find blank cells in column B')).not.toBe('clear_sheet')
    expect(toolOf('count the blank rows')).not.toBe('clear_sheet')
    expect(toolOf('how many blank cells are there?')).not.toBe('clear_sheet')
  })

  it('does not match non-commands that mention clearing', () => {
    expect(resolveActTemplates('do not clear the sheet').actions).toHaveLength(0)
    expect(resolveActTemplates("don't reset the sheet").actions).toHaveLength(0)
    expect(resolveActTemplates('explain how to clear the sheet').actions).toHaveLength(0)
    expect(resolveActTemplates('what if I blank out the sheet?').actions).toHaveLength(0)
    expect(resolveActTemplates('say "clear the sheet"').actions).toHaveLength(0)
  })
})

describe('resolveActTemplates — other rules still resolve', () => {
  it('resolves template generators', () => {
    expect(toolOf('create a monthly budget')).toBe('create_budget_template')
    expect(toolOf('make a sales tracker')).toBe('create_sales_tracker')
  })

  it('resolves formatting rules', () => {
    expect(toolOf('bold the headers')).toBe('format_cells')
    expect(toolOf('format as table')).toBe('format_as_table')
  })

  it('ignores non-commands for every rule', () => {
    expect(resolveActTemplates('explain how to create a budget').actions).toHaveLength(0)
    expect(resolveActTemplates('do not add a chart').actions).toHaveLength(0)
    expect(resolveActTemplates('what if I sort by amount?').actions).toHaveLength(0)
  })
})

/**
 * Regression: "highlight rent" used to resolve to an UNSCOPED format_cells, which
 * recoloured every cell (or the wrong one). Anything naming a target we cannot
 * map must defer to the LLM; explicit targets must carry their range.
 */
describe('resolveActTemplates — styling requests are scoped, never guessed', () => {
  function paramsOf(message: string): Record<string, unknown> | undefined {
    return resolveActTemplates(message).actions[0]?.params as Record<string, unknown> | undefined
  }

  it('defers a named target it cannot map instead of formatting the selection', () => {
    for (const msg of [
      'highlight rent',
      'highlight groceries',
      'highlight duplicates',
      'highlight the errors',
      'highlight anything over 500',
      'highlight where the category is food',
      'highlight all rows containing Netflix',
    ]) {
      expect(resolveActTemplates(msg).actions, msg).toHaveLength(0)
    }
  })

  it('carries an explicit cell, range, column, row or header as a range', () => {
    expect(paramsOf('highlight cell B7')).toMatchObject({ range: 'B7', bgColor: '#FFF9C4' })
    expect(paramsOf('highlight B7')).toMatchObject({ range: 'B7' })
    expect(paramsOf('highlight a1:c3 in red')).toMatchObject({ range: 'A1:C3' })
    expect(paramsOf('highlight column C')).toMatchObject({ range: 'C' })
    expect(paramsOf('highlight row 5')).toMatchObject({ range: 'A5:Z5' })
    expect(paramsOf('bold the headers')).toMatchObject({ range: 'A1:Z1', bold: true })
  })

  it('resolves a literal value after says / named / called', () => {
    expect(paramsOf('highlight the cell that says groceries')).toMatchObject({
      condition: { operator: 'contains', value: 'groceries' },
    })
    expect(paramsOf('highlight cells named rent')).toMatchObject({
      condition: { operator: 'contains', value: 'rent' },
    })
  })

  it('styles the whole sheet only when asked for explicitly', () => {
    expect(paramsOf('make everything bold')).toMatchObject({ bold: true, range: 'all' })
    expect(paramsOf('highlight all cells in yellow')).toMatchObject({ range: 'all' })
    expect(paramsOf('change all text to red')).toMatchObject({ fontColor: expect.any(String), range: 'all' })
    // "all" plus a target we cannot map is still deferred, not widened.
    expect(resolveActTemplates('highlight all rows containing Netflix').actions).toHaveLength(0)
  })

  it('scopes a font-colour request too, deferring an unmappable target', () => {
    expect(resolveActTemplates('make the rent text red').actions).toHaveLength(0)
    expect(paramsOf('change the text in B2 to red')).toMatchObject({ range: 'B2' })
  })

  it('still formats the selection when the message names no target', () => {
    expect(paramsOf('highlight in red')).toMatchObject({ bgColor: expect.any(String) })
    expect(paramsOf('highlight this cell')).toMatchObject({ bgColor: '#FFF9C4' })
    expect(paramsOf('highlight cells in yellow')).toMatchObject({ bgColor: expect.any(String) })
    expect(paramsOf('highlight in red')).not.toHaveProperty('range')
  })

  it('does not let formula or template rules claim a styling request', () => {
    for (const msg of [
      'highlight the total',
      'highlight the largest value',
      'highlight the highest amount',
      'highlight the lowest expense',
      'color the total green',
      'make the total bold',
    ]) {
      const tools = resolveActTemplates(msg).actions.map((a) => a.tool)
      expect(tools, msg).not.toContain('apply_formula')
      expect(tools, msg).not.toContain('create_budget_template')
    }
  })

  it('does not treat a part-of-sheet clear or an empty-cell highlight as a sheet wipe', () => {
    for (const msg of ['highlight empty cells', 'highlight the blank cells', 'clear cell B2', 'clear column C', 'show empty cells']) {
      expect(toolOf(msg), msg).not.toBe('clear_sheet')
    }
    expect(toolOf('clear all cells')).toBe('clear_sheet')
    expect(toolOf('clear the whole sheet')).toBe('clear_sheet')
  })
})

describe('resolveActTemplates — numeric-highlight gating', () => {
  function operatorOf(message: string): string | undefined {
    const params = resolveActTemplates(message).actions[0]?.params as
      | { condition?: { operator?: string } }
      | undefined
    return params?.condition?.operator
  }

  it('routes an explicit highlight/color numeric request to is_number', () => {
    expect(operatorOf('highlight cells that contain numbers')).toBe('is_number')
    expect(operatorOf('color numeric cells blue')).toBe('is_number')
    expect(operatorOf('make cells with numbers red')).toBe('is_number')
  })

  it('does NOT swallow "make numeric cells bold" as an is_number highlight FILL', () => {
    // bold reaches the formatting resolver, but the numeric FILL branch must not
    // claim it. The bold applies to numeric cells only (condition), not the whole
    // selection, and no background colour is added.
    const action = resolveActTemplates('make numeric cells bold').actions[0]
    expect(action?.params).toMatchObject({ bold: true, condition: { operator: 'is_number' } })
    expect(action?.params).not.toHaveProperty('bgColor')
  })

  it('does NOT swallow a numeric font-color request as an is_number highlight', () => {
    // "numeric font color blue" is a font-color intent, not a background fill:
    // the colour goes on the font of numeric cells, with no bgColor.
    const action = resolveActTemplates('change the numeric font color to blue').actions[0]
    expect(action?.params).toMatchObject({ fontColor: expect.any(String), condition: { operator: 'is_number' } })
    expect(action?.params).not.toHaveProperty('bgColor')
  })
})

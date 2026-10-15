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

  it('does NOT swallow "make numeric cells bold" as an is_number highlight', () => {
    // bold reaches the formatting resolver, but the numeric FILL branch must not
    // claim it — it falls through to the generic bold handler.
    const action = resolveActTemplates('make numeric cells bold').actions[0]
    expect((action?.params as { condition?: unknown })?.condition).toBeUndefined()
    expect(action?.params).toMatchObject({ bold: true })
  })

  it('does NOT swallow a numeric font-color request as an is_number highlight', () => {
    // "numeric font color blue" is a font-color intent, not a background fill.
    const op = operatorOf('change the numeric font color to blue')
    expect(op).not.toBe('is_number')
  })
})

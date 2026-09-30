/**
 * Agent Parser — non-command corpus.
 *
 * Regression corpus for the reproduced defect: the single-clause regexes match
 * command *fragments*, so "do not set A1 to 100" and "explain how to set A1 to
 * 100" both resolved to `set_cell` and mutated A1 with no approval step.
 *
 * Every phrase here must pass through to the explanatory path instead.
 */

import { describe, expect, it } from 'vitest'
import { parseMessage, type SheetContext } from '../parser'

const budgetContext: SheetContext = {
  headerRow: 0,
  lastDataRow: 10,
  lastDataCol: 4,
  headers: ['Category', 'Description', 'Amount', 'Date', 'Status'],
  columns: [
    { column: 'A', name: 'Category', dtype: 'string', role: 'label' as const, nonNullCount: 10, nullCount: 0, uniqueCount: 5, sampleValues: ['Rent'] },
    { column: 'B', name: 'Description', dtype: 'string', role: 'label' as const, nonNullCount: 10, nullCount: 0, uniqueCount: 10, sampleValues: ['Monthly rent'] },
    { column: 'C', name: 'Amount', dtype: 'number', role: 'amount' as const, nonNullCount: 10, nullCount: 0, uniqueCount: 10, sampleValues: [1200, 450], minVal: 10, maxVal: 5000 },
    { column: 'D', name: 'Date', dtype: 'date', role: 'date' as const, nonNullCount: 8, nullCount: 2, uniqueCount: 8, sampleValues: ['2026-01-15'] },
    { column: 'E', name: 'Status', dtype: 'string', role: 'label' as const, nonNullCount: 8, nullCount: 2, uniqueCount: 3, sampleValues: ['Paid', 'Pending'] },
  ],
}

function expectNoMutation(message: string, context: SheetContext = budgetContext) {
  const result = parseMessage(message, context)
  expect(
    result.calls.length,
    `"${message}" produced ${result.calls.map((c) => c.tool).join(', ')}`,
  ).toBe(0)
}

describe('Agent Parser — non-commands never resolve to a tool call', () => {
  describe('Negated commands', () => {
    const phrases = [
      'do not set A1 to 100',
      "don't set A1 to 100",
      'please do not delete row 3',
      'never clear the sheet',
      'do not sort by amount',
      'make sure you do not overwrite B2',
      'you should not rename the sheet',
    ]
    for (const phrase of phrases) {
      it(`"${phrase}"`, () => expectNoMutation(phrase))
    }
  })

  describe('Explanatory commands', () => {
    const phrases = [
      'explain how to set A1 to 100',
      'how do I set A1 to 100?',
      'how to add a SUM formula for column B',
      'what does "set A1 to 100" do?',
      'tell me how to delete a row',
      'show me how to format the header row',
      'walk me through sorting by amount',
      'can you explain how to build a budget?',
    ]
    for (const phrase of phrases) {
      it(`"${phrase}"`, () => expectNoMutation(phrase))
    }
  })

  describe('Hypothetical commands', () => {
    const phrases = [
      'what if I set A1 to 100?',
      'what if I clear the sheet',
      'if I delete row 3 what happens?',
      'imagine I sorted by amount',
      'suppose I added a total row',
      "let's say I reset the sheet",
      'pretend I set B2 to 0',
      'assume I removed the duplicates',
      'what would happen if I wiped the sheet?',
    ]
    for (const phrase of phrases) {
      it(`"${phrase}"`, () => expectNoMutation(phrase))
    }
  })

  describe('Quoted commands', () => {
    const phrases = [
      'say "set A1 to 100"',
      'write "delete row 3" in the chat',
      '"set A1 to 100"',
      'repeat "sort by amount" back to me',
    ]
    for (const phrase of phrases) {
      it(`"${phrase}"`, () => expectNoMutation(phrase))
    }
  })
})

describe('Agent Parser — explicit commands still resolve', () => {
  const cases: Array<[string, string]> = [
    ['set A1 to 100', 'set_cell'],
    ['set A1 to "hello world"', 'set_cell'],
    ['delete row 3', 'delete_row'],
    ['sort by amount highest first', 'sort_sheet'],
    ['bold the headers', 'format_cells'],
    ['add a row: Groceries, 400, 2026-01-01', 'add_row'],
    ['clear and build a budget', 'clear_sheet'],
    ['average column C', 'apply_formula'],
    ['filter status equals Paid', 'filter'],
    ['rename column A to Category', 'rename_header'],
    ['export as CSV', 'export_data'],
  ]

  for (const [phrase, tool] of cases) {
    it(`"${phrase}" → ${tool}`, () => {
      const result = parseMessage(phrase, budgetContext)
      expect(result.calls.map((c) => c.tool)).toContain(tool)
    })
  }
})

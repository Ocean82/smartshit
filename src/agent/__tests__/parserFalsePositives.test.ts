/**
 * Agent Parser — False-Positive Corpus
 *
 * Validates that the instant regex agent parser does NOT fire on ambiguous,
 * conversational, or informational phrases. These should fall through to the
 * LLM stage for proper handling.
 *
 * A false positive here means a mutation would execute without user confirmation
 * or LLM clarification — a critical trust/safety issue.
 *
 * REF: major-review.md investigation I3 (Regex agent false-positive mutations)
 */

import { describe, it, expect } from 'vitest'
import { parseMessage, type SheetContext } from '../parser'

// ─── Shared test context (typical budget spreadsheet) ────────────────────────

const budgetContext: SheetContext = {
  headerRow: 0,
  lastDataRow: 10,
  lastDataCol: 4,
  headers: ['Category', 'Description', 'Amount', 'Date', 'Status'],
  columns: [
    { column: 'A', name: 'Category', dtype: 'string', role: 'label' as const, nonNullCount: 10, nullCount: 0, uniqueCount: 5, sampleValues: ['Rent', 'Groceries'] },
    { column: 'B', name: 'Description', dtype: 'string', role: 'label' as const, nonNullCount: 10, nullCount: 0, uniqueCount: 10, sampleValues: ['Monthly rent', 'Weekly shop'] },
    { column: 'C', name: 'Amount', dtype: 'number', role: 'amount' as const, nonNullCount: 10, nullCount: 0, uniqueCount: 10, sampleValues: [1200, 450], minVal: 10, maxVal: 5000 },
    { column: 'D', name: 'Date', dtype: 'date', role: 'date' as const, nonNullCount: 8, nullCount: 2, uniqueCount: 8, sampleValues: ['2026-01-15', '2026-02-01'] },
    { column: 'E', name: 'Status', dtype: 'string', role: 'label' as const, nonNullCount: 8, nullCount: 2, uniqueCount: 3, sampleValues: ['Paid', 'Pending'] },
  ],
}

// Helper: assert the parser does NOT claim the input as understood
function expectPassThrough(message: string, context?: SheetContext) {
  const result = parseMessage(message, context ?? budgetContext)
  expect(
    result.understood === false || (result.understood && result.calls.length === 0),
    `Expected "${message}" to pass through to LLM, but parser claimed it with: ${
      result.calls.map(c => `${c.tool}(${JSON.stringify(c.params)})`).join(', ') || result.explanation
    }`,
  ).toBe(true)
}

// Helper: assert the parser does NOT produce mutation calls
function expectNoMutations(message: string, context?: SheetContext) {
  const result = parseMessage(message, context ?? budgetContext)
  const mutationCalls = result.calls.filter(c =>
    !['count_rows', 'find_max', 'find_min'].includes(c.tool),
  )
  expect(
    mutationCalls.length === 0,
    `Expected "${message}" to produce no mutations, but got: ${
      mutationCalls.map(c => `${c.tool}(${JSON.stringify(c.params)})`).join(', ')
    }`,
  ).toBe(true)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Agent Parser — False Positive Corpus (should NOT trigger mutations)', () => {
  describe('Conversational / informational questions', () => {
    const phrases = [
      'What does this spreadsheet contain?',
      'Can you explain my data?',
      'How much did I spend last month?',
      'What are my biggest expenses?',
      'Tell me about the data in this sheet',
      'Summarize my budget',
      'Is my spending on track?',
      'What patterns do you see?',
      'Help me understand these numbers',
      'What should I do to reduce costs?',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → no mutations`, () => {
        expectNoMutations(phrase)
      })
    }
  })

  describe('Ambiguous commands that need clarification', () => {
    const phrases = [
      'delete that one',
      'remove the duplicate',
      'sort it',
      'fix it',
      'clean up the data',
      'organize this better',
      'make it look nice',
      'format it properly',
      'update the totals',
      'change the values',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → no mutations`, () => {
        expectNoMutations(phrase)
      })
    }
  })

  describe('Phrases containing action words but are questions', () => {
    const phrases = [
      'How do I sort by date?',
      'Can I delete multiple rows at once?',
      'What happens if I remove this column?',
      'Should I add a total row?',
      'Would it help to filter by status?',
      'Is there a way to highlight outliers?',
      'How to add a formula for tax?',
      'Where should I put the totals?',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → no mutations`, () => {
        expectNoMutations(phrase)
      })
    }
  })

  describe('Phrases about removing non-row things', () => {
    const phrases = [
      'remove formatting',
      'remove the filter',
      'remove duplicates',
      'remove conditional formatting',
      'delete the chart',
      'remove all colors',
      'clear formatting',
      'remove borders',
      'remove the background color',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → does not trigger delete_row`, () => {
        const result = parseMessage(phrase, budgetContext)
        const deleteCall = result.calls.find(c => c.tool === 'delete_row')
        expect(
          deleteCall,
          `"${phrase}" incorrectly triggered delete_row with params: ${JSON.stringify(deleteCall?.params)}`,
        ).toBeUndefined()
      })
    }
  })

  describe('Phrases with "add" that are not row additions', () => {
    const phrases = [
      'add a column for tax',
      'add a chart',
      'add conditional formatting',
      'add borders to the table',
      'add a total at the bottom',
      'add validation to column B',
      'can you add percentage formatting',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → does not trigger add_row`, () => {
        const result = parseMessage(phrase, budgetContext)
        const addCall = result.calls.find(c => c.tool === 'add_row')
        expect(
          addCall,
          `"${phrase}" incorrectly triggered add_row with params: ${JSON.stringify(addCall?.params)}`,
        ).toBeUndefined()
      })
    }
  })

  describe('Phrases with "set" that are not cell mutations', () => {
    const phrases = [
      'set up a budget tracker',
      'set this as the header',
      'set a reminder for me',
      'set up conditional rules',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → does not trigger set_cell`, () => {
        const result = parseMessage(phrase, budgetContext)
        const setCall = result.calls.find(c => c.tool === 'set_cell')
        expect(
          setCall,
          `"${phrase}" incorrectly triggered set_cell with params: ${JSON.stringify(setCall?.params)}`,
        ).toBeUndefined()
      })
    }
  })

  describe('Phrases with "clear" that should not wipe the sheet', () => {
    const phrases = [
      'clear the formatting',
      'clear the filter',
      'clear my selection',
      'clear the search',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → does not trigger clear_sheet`, () => {
        const result = parseMessage(phrase, budgetContext)
        const clearCall = result.calls.find(c => c.tool === 'clear_sheet')
        expect(
          clearCall,
          `"${phrase}" incorrectly triggered clear_sheet`,
        ).toBeUndefined()
      })
    }
  })

  describe('Statements about spreadsheet concepts (educational)', () => {
    const phrases = [
      'What is a VLOOKUP?',
      'explain SUM vs SUMIF',
      'how do pivot tables work',
      'what are absolute references',
      'tell me about conditional formatting',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → passes through`, () => {
        expectPassThrough(phrase)
      })
    }
  })

  describe('Feedback and appreciation (should never mutate)', () => {
    const phrases = [
      'thanks',
      'great job',
      'that looks good',
      'perfect',
      'nevermind',
      'undo that',
      'go back',
      'cancel',
    ]

    for (const phrase of phrases) {
      it(`"${phrase}" → passes through`, () => {
        expectPassThrough(phrase)
      })
    }
  })
})

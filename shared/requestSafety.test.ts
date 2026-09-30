/**
 * Request safety policy — the first gate before any mutation.
 *
 * Regression corpus for the reproduced defect: the regex parser matched command
 * *fragments*, so "do not set A1 to 100" and "explain how to set A1 to 100"
 * both changed A1 immediately with no approval step.
 *
 * The negative cases matter as much as the positive ones — an over-eager guard
 * would silently swallow legitimate commands.
 */

import { describe, expect, it } from 'vitest'
import { classifyRequestSafety, isNonCommandRequest } from './requestSafety'

// ─── Non-commands: must never reach a mutating stage ────────────────────────

describe('requestSafety — negated requests', () => {
  const phrases = [
    'do not set A1 to 100',
    "don't set A1 to 100",
    'dont set A1 to 100',
    'please do not delete row 3',
    'never clear the sheet',
    'do not sort by amount',
    'avoid adding a total row',
    'stop modifying column B',
    'you should not rename the sheet',
    'make sure you do not overwrite B2',
    "I don't want you to fill column C",
  ]

  for (const phrase of phrases) {
    it(`"${phrase}" → non-command (negated)`, () => {
      expect(isNonCommandRequest(phrase)).toBe(true)
      expect(classifyRequestSafety(phrase).reason).toBe('negated')
    })
  }
})

describe('requestSafety — explanatory requests', () => {
  const phrases = [
    'explain how to set A1 to 100',
    'explain how I would delete row 3',
    'how do I set A1 to 100?',
    'how to add a SUM formula for column B',
    'how can I sort this sheet by date?',
    'what does "set A1 to 100" do?',
    'what is the formula to clear column B?',
    'tell me how to delete a row',
    'show me how to format the header row',
    'walk me through sorting by amount',
    'which column should I sum?',
    'can you explain how to build a budget?',
  ]

  for (const phrase of phrases) {
    it(`"${phrase}" → non-command (explanatory)`, () => {
      expect(isNonCommandRequest(phrase)).toBe(true)
      expect(classifyRequestSafety(phrase).reason).toBe('explanatory')
    })
  }
})

describe('requestSafety — hypothetical requests', () => {
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
    'what happens if I remove the filter?',
  ]

  for (const phrase of phrases) {
    it(`"${phrase}" → non-command (hypothetical)`, () => {
      expect(isNonCommandRequest(phrase)).toBe(true)
      expect(classifyRequestSafety(phrase).reason).toBe('hypothetical')
    })
  }
})

describe('requestSafety — quoted requests', () => {
  const phrases = [
    'say "set A1 to 100"',
    'write "delete row 3" in the chat',
    '"set A1 to 100"',
    "echo 'clear the sheet'",
    'repeat "sort by amount" back to me',
  ]

  for (const phrase of phrases) {
    it(`"${phrase}" → non-command (quoted)`, () => {
      expect(isNonCommandRequest(phrase)).toBe(true)
      expect(classifyRequestSafety(phrase).reason).toBe('quoted')
    })
  }
})

// ─── Commands: must keep working exactly as before ──────────────────────────

describe('requestSafety — explicit commands stay commands', () => {
  const phrases = [
    'set A1 to 100',
    'set A1 to "hello world"',
    'delete row 3',
    'delete the Netflix row',
    'sort by amount highest first',
    'bold the headers',
    'add a row: Groceries, 400, 2026-01-01',
    'clear the sheet',
    'create a monthly budget',
    'sum column B',
    'highlight anything over 500',
    'rename column A to Category',
    'replace Netflix with Hulu',
    'export as CSV',
    'add 10% to column C',
    'filter status equals Paid',
    'update the totals',
    "don't",
    'never mind',
    'stop',
    'what is my cheapest expense?',
    "what's my biggest expense?",
    'what are the column names?',
    'how much did I spend last month?',
    'what if the numbers look off?',
    'is there a blank cell in column B?',
    'count the blank rows',
    'find blank cells in column B',
    'create a formula to fill blank cells with zero',
    'explain this spreadsheet I just loaded',
    'explain how pivot tables work',
    'explain what a VLOOKUP does',
    'where am I overspending?',
  ]

  for (const phrase of phrases) {
    it(`"${phrase}" → still a command`, () => {
      expect(isNonCommandRequest(phrase), `"${phrase}" was wrongly treated as a non-command`).toBe(false)
    })
  }
})

describe('requestSafety — questions that never mutated anyway', () => {
  // These are conversations, not commands. They are handed to the explanatory
  // path (the regex parser never claimed them), which is the correct outcome.
  const phrases = ['explain SUM vs SUMIF']

  for (const phrase of phrases) {
    it(`"${phrase}" → never mutates`, () => {
      expect(isNonCommandRequest(phrase)).toBe(true)
    })
  }
})

describe('requestSafety — empty input', () => {
  it('treats an empty message as a command (nothing to guard)', () => {
    expect(isNonCommandRequest('')).toBe(false)
    expect(isNonCommandRequest('   ')).toBe(false)
  })
})

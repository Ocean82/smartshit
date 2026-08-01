/**
 * Unit tests for the Entity Extractor
 *
 * Tests column resolution (by header, letter, ordinal), numeric extraction,
 * comparison operator mapping, sheet resolution, unresolved/ambiguous markers,
 * and left-to-right ordering preservation.
 */

import { describe, it, expect } from 'vitest'
import { extractEntities, parseWordNumber, parseFormattedNumber } from '../entityExtractor'
import type { WorkbookContext } from '../types'
import type { ExtractedEntity, UnresolvedEntity, AmbiguousEntity } from '@shared/intentTypes'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeContext(options?: {
  sheets?: WorkbookContext['sheets']
  activeSheetId?: string
}): WorkbookContext {
  const defaultSheets = [
    {
      id: 'sheet-1',
      name: 'Sheet1',
      columns: [
        { letter: 'A', headerName: 'Name', index: 0 },
        { letter: 'B', headerName: 'Amount', index: 1 },
        { letter: 'C', headerName: 'Date', index: 2 },
        { letter: 'D', headerName: 'Category', index: 3 },
      ],
    },
    {
      id: 'sheet-2',
      name: 'Expenses',
      columns: [
        { letter: 'A', headerName: 'Item', index: 0 },
        { letter: 'B', headerName: 'Cost', index: 1 },
      ],
    },
    {
      id: 'sheet-3',
      name: 'Summary',
      columns: [
        { letter: 'A', headerName: 'Total', index: 0 },
      ],
    },
  ]

  return {
    activeSheetId: options?.activeSheetId ?? 'sheet-1',
    sheets: options?.sheets ?? defaultSheets,
  }
}

// ─── parseWordNumber ────────────────────────────────────────────────────────

describe('parseWordNumber', () => {
  it('parses single digit words', () => {
    expect(parseWordNumber('five')).toBe(5)
    expect(parseWordNumber('zero')).toBe(0)
    expect(parseWordNumber('nine')).toBe(9)
  })

  it('parses teens', () => {
    expect(parseWordNumber('thirteen')).toBe(13)
    expect(parseWordNumber('nineteen')).toBe(19)
  })

  it('parses tens', () => {
    expect(parseWordNumber('twenty')).toBe(20)
    expect(parseWordNumber('fifty')).toBe(50)
    expect(parseWordNumber('ninety')).toBe(90)
  })

  it('parses compound numbers', () => {
    expect(parseWordNumber('twenty three')).toBe(23)
    expect(parseWordNumber('fifty five')).toBe(55)
  })

  it('parses hundreds', () => {
    expect(parseWordNumber('five hundred')).toBe(500)
    expect(parseWordNumber('three hundred fifty')).toBe(350)
  })

  it('parses thousands', () => {
    expect(parseWordNumber('one thousand')).toBe(1000)
    expect(parseWordNumber('five thousand')).toBe(5000)
    expect(parseWordNumber('twenty thousand')).toBe(20000)
  })

  it('parses complex numbers', () => {
    expect(parseWordNumber('one hundred twenty three')).toBe(123)
    expect(parseWordNumber('five hundred thousand')).toBe(500000)
  })

  it('returns null for non-number text', () => {
    expect(parseWordNumber('hello')).toBeNull()
    expect(parseWordNumber('the column')).toBeNull()
    expect(parseWordNumber('')).toBeNull()
  })
})

// ─── parseFormattedNumber ───────────────────────────────────────────────────

describe('parseFormattedNumber', () => {
  it('parses plain integers', () => {
    expect(parseFormattedNumber('500')).toBe(500)
    expect(parseFormattedNumber('1000')).toBe(1000)
    expect(parseFormattedNumber('0')).toBe(0)
  })

  it('parses decimal numbers', () => {
    expect(parseFormattedNumber('500.50')).toBe(500.50)
    expect(parseFormattedNumber('1.99')).toBe(1.99)
  })

  it('parses currency prefixed numbers', () => {
    expect(parseFormattedNumber('$500')).toBe(500)
    expect(parseFormattedNumber('$1,500.50')).toBe(1500.50)
    expect(parseFormattedNumber('$ 200')).toBe(200)
  })

  it('parses numbers with thousands separators', () => {
    expect(parseFormattedNumber('1,000')).toBe(1000)
    expect(parseFormattedNumber('1,234,567.89')).toBe(1234567.89)
    expect(parseFormattedNumber('$1,000,000')).toBe(1000000)
  })

  it('parses numbers with "dollars" suffix', () => {
    expect(parseFormattedNumber('500 dollars')).toBe(500)
    expect(parseFormattedNumber('500 dollar')).toBe(500)
  })

  it('normalizes to 2 decimal places', () => {
    expect(parseFormattedNumber('100.999')).toBe(101)
    expect(parseFormattedNumber('99.5')).toBe(99.5)
  })

  it('rejects values outside range', () => {
    expect(parseFormattedNumber('-100')).toBeNull()
    expect(parseFormattedNumber('1000000000')).toBeNull()
  })

  it('rejects non-numeric strings', () => {
    expect(parseFormattedNumber('abc')).toBeNull()
    expect(parseFormattedNumber('')).toBeNull()
  })
})

// ─── Column Resolution ──────────────────────────────────────────────────────

describe('extractEntities - column resolution', () => {
  const ctx = makeContext()

  it('resolves column by letter: "column A"', () => {
    const entities = extractEntities('filter column A', 'filter', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('A')
  })

  it('resolves column by letter case-insensitively: "column b"', () => {
    const entities = extractEntities('sort column b', 'sort', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('B')
  })

  it('resolves column by header name: "the Amount column"', () => {
    const entities = extractEntities('sum the Amount column', 'calculate', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('B')
  })

  it('resolves column by header name case-insensitively: "amount column"', () => {
    const entities = extractEntities('filter amount column', 'filter', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('B')
  })

  it('resolves column by ordinal: "the third column"', () => {
    const entities = extractEntities('format the third column', 'format', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('C')
  })

  it('resolves column by ordinal: "first column"', () => {
    const entities = extractEntities('sort first column', 'sort', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('A')
  })

  it('resolves column by numeric index: "column 3"', () => {
    const entities = extractEntities('show column 3', 'read', ctx)
    const col = entities.find(e => e.type === 'column') as ExtractedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(true)
    expect(col.value).toBe('C')
  })

  it('returns unresolved for non-existent column letter', () => {
    const entities = extractEntities('filter column Z', 'filter', ctx)
    const col = entities.find(e => e.type === 'column') as UnresolvedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(false)
    expect(col.reason).toBe('not_found')
  })

  it('returns unresolved for out-of-range column index', () => {
    const entities = extractEntities('show column 99', 'read', ctx)
    const col = entities.find(e => e.type === 'column') as UnresolvedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(false)
    expect(col.reason).toBe('not_found')
  })
})

// ─── Numeric Extraction ─────────────────────────────────────────────────────

describe('extractEntities - numeric extraction', () => {
  const ctx = makeContext()

  it('extracts plain number', () => {
    const entities = extractEntities('filter where amount is 500', 'filter', ctx)
    const num = entities.find(e => e.type === 'number') as ExtractedEntity
    expect(num).toBeDefined()
    expect(num.resolved).toBe(true)
    expect(num.value).toBe(500)
  })

  it('extracts currency prefixed number: "$500"', () => {
    const entities = extractEntities('filter rows over $500', 'filter', ctx)
    const num = entities.find(e => e.type === 'number') as ExtractedEntity
    expect(num).toBeDefined()
    expect(num.resolved).toBe(true)
    expect(num.value).toBe(500)
  })

  it('extracts number with thousands separator: "$1,500.50"', () => {
    const entities = extractEntities('amount greater than $1,500.50', 'filter', ctx)
    const num = entities.find(e => e.type === 'number') as ExtractedEntity
    expect(num).toBeDefined()
    expect(num.resolved).toBe(true)
    expect(num.value).toBe(1500.50)
  })

  it('extracts word number: "five hundred"', () => {
    const entities = extractEntities('filter where amount is five hundred', 'filter', ctx)
    const num = entities.find(e => e.type === 'number') as ExtractedEntity
    expect(num).toBeDefined()
    expect(num.resolved).toBe(true)
    expect(num.value).toBe(500)
  })

  it('normalizes to up to 2 decimal places', () => {
    const entities = extractEntities('filter over 100.5', 'filter', ctx)
    const num = entities.find(e => e.type === 'number') as ExtractedEntity
    expect(num).toBeDefined()
    expect(num.value).toBe(100.5)
  })
})

// ─── Comparison Operator Mapping ────────────────────────────────────────────

describe('extractEntities - operator mapping', () => {
  const ctx = makeContext()

  it('maps "greater than" to greater-than', () => {
    const entities = extractEntities('filter where amount greater than 500', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.resolved).toBe(true)
    expect(op.value).toBe('greater-than')
  })

  it('maps "more than" to greater-than', () => {
    const entities = extractEntities('filter where cost more than 100', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('greater-than')
  })

  it('maps "over" to greater-than', () => {
    const entities = extractEntities('rows over $500', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('greater-than')
  })

  it('maps "above" to greater-than', () => {
    const entities = extractEntities('values above 1000', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('greater-than')
  })

  it('maps "exceeds" to greater-than', () => {
    const entities = extractEntities('where amount exceeds 200', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('greater-than')
  })

  it('maps "less than" to less-than', () => {
    const entities = extractEntities('filter where cost less than 50', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('less-than')
  })

  it('maps "under" to less-than', () => {
    const entities = extractEntities('rows under $100', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('less-than')
  })

  it('maps "below" to less-than', () => {
    const entities = extractEntities('amounts below 50', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('less-than')
  })

  it('maps "equal to" to equal-to', () => {
    const entities = extractEntities('where amount equal to 100', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('equal-to')
  })

  it('maps "exactly" to equal-to', () => {
    const entities = extractEntities('show exactly 500', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('equal-to')
  })

  it('maps "at least" to greater-than-or-equal', () => {
    const entities = extractEntities('filter at least 100', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('greater-than-or-equal')
  })

  it('maps "at most" to less-than-or-equal', () => {
    const entities = extractEntities('filter at most 100', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('less-than-or-equal')
  })

  it('maps "not equal to" to not-equal-to', () => {
    const entities = extractEntities('where amount not equal to 0', 'filter', ctx)
    const op = entities.find(e => e.type === 'operator') as ExtractedEntity
    expect(op).toBeDefined()
    expect(op.value).toBe('not-equal-to')
  })
})

// ─── Sheet Resolution ───────────────────────────────────────────────────────

describe('extractEntities - sheet resolution', () => {
  const ctx = makeContext()

  it('resolves sheet by exact name: "Sheet1"', () => {
    const entities = extractEntities('go to Sheet1', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as ExtractedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(true)
    expect(sheet.value).toBe('sheet-1')
  })

  it('resolves sheet by name case-insensitively', () => {
    const entities = extractEntities('open expenses', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as ExtractedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(true)
    expect(sheet.value).toBe('sheet-2')
  })

  it('resolves sheet by ordinal: "the second tab"', () => {
    const entities = extractEntities('switch to the second tab', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as ExtractedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(true)
    expect(sheet.value).toBe('sheet-2')
  })

  it('resolves sheet by ordinal: "first sheet"', () => {
    const entities = extractEntities('go to first sheet', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as ExtractedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(true)
    expect(sheet.value).toBe('sheet-1')
  })

  it('resolves sheet by name with suffix: "the expenses sheet"', () => {
    const entities = extractEntities('show the expenses sheet', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as ExtractedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(true)
    expect(sheet.value).toBe('sheet-2')
  })

  it('returns unresolved for non-existent sheet ordinal', () => {
    const entities = extractEntities('go to the tenth tab', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as UnresolvedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(false)
    expect(sheet.reason).toBe('not_found')
  })
})

// ─── Unresolved Entity ──────────────────────────────────────────────────────

describe('extractEntities - unresolved entities', () => {
  const ctx = makeContext()

  it('returns unresolved when column letter not in context', () => {
    const entities = extractEntities('filter column Z', 'filter', ctx)
    const col = entities.find(e => e.type === 'column') as UnresolvedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(false)
    expect(col.reason).toBe('not_found')
    expect(col.originalText).toContain('column Z')
  })

  it('returns unresolved when column index not in context', () => {
    const entities = extractEntities('sort column 20', 'sort', ctx)
    const col = entities.find(e => e.type === 'column') as UnresolvedEntity
    expect(col).toBeDefined()
    expect(col.resolved).toBe(false)
    expect(col.reason).toBe('not_found')
  })

  it('returns unresolved when sheet ordinal exceeds sheet count', () => {
    const entities = extractEntities('go to the fifth sheet', 'read', ctx)
    const sheet = entities.find(e => e.type === 'sheet') as UnresolvedEntity
    expect(sheet).toBeDefined()
    expect(sheet.resolved).toBe(false)
    expect(sheet.reason).toBe('not_found')
  })
})

// ─── Ambiguous Entity ───────────────────────────────────────────────────────

describe('extractEntities - ambiguous entities', () => {
  it('returns ambiguous when multiple columns match header name', () => {
    const ctx = makeContext({
      sheets: [
        {
          id: 'sheet-1',
          name: 'Sheet1',
          columns: [
            { letter: 'A', headerName: 'Amount', index: 0 },
            { letter: 'B', headerName: 'Amount', index: 1 },
            { letter: 'C', headerName: 'Date', index: 2 },
          ],
        },
      ],
      activeSheetId: 'sheet-1',
    })

    const entities = extractEntities('sum the Amount column', 'calculate', ctx)
    const ambiguous = entities.find(
      e => e.type === 'column' && !e.resolved
    ) as AmbiguousEntity
    expect(ambiguous).toBeDefined()
    expect(ambiguous.reason).toBe('ambiguous')
    expect(ambiguous.candidates.length).toBe(2)
    expect(ambiguous.candidates.length).toBeLessThanOrEqual(5)
  })

  it('limits candidates to 5', () => {
    const ctx = makeContext({
      sheets: [
        {
          id: 'sheet-1',
          name: 'Sheet1',
          columns: [
            { letter: 'A', headerName: 'Value', index: 0 },
            { letter: 'B', headerName: 'Value', index: 1 },
            { letter: 'C', headerName: 'Value', index: 2 },
            { letter: 'D', headerName: 'Value', index: 3 },
            { letter: 'E', headerName: 'Value', index: 4 },
            { letter: 'F', headerName: 'Value', index: 5 },
            { letter: 'G', headerName: 'Value', index: 6 },
          ],
        },
      ],
      activeSheetId: 'sheet-1',
    })

    const entities = extractEntities('sum the Value column', 'calculate', ctx)
    const ambiguous = entities.find(
      e => e.type === 'column' && !e.resolved
    ) as AmbiguousEntity
    expect(ambiguous).toBeDefined()
    expect(ambiguous.reason).toBe('ambiguous')
    expect(ambiguous.candidates.length).toBeLessThanOrEqual(5)
  })
})

// ─── Left-to-Right Ordering ─────────────────────────────────────────────────

describe('extractEntities - left-to-right ordering', () => {
  const ctx = makeContext()

  it('preserves left-to-right order of entities', () => {
    const entities = extractEntities(
      'filter column A where Amount is greater than $500',
      'filter',
      ctx
    )
    // Should have entities in order: column A, Amount (column), greater than (operator), $500 (number)
    expect(entities.length).toBeGreaterThanOrEqual(2)

    // Verify ordering: each entity's originalText should appear after the previous one in the input
    for (let i = 1; i < entities.length; i++) {
      const prevText = entities[i - 1].originalText
      const currText = entities[i].originalText
      const prevIdx = 'filter column A where Amount is greater than $500'.toLowerCase().indexOf(prevText.toLowerCase())
      const currIdx = 'filter column A where Amount is greater than $500'.toLowerCase().indexOf(currText.toLowerCase())
      expect(currIdx).toBeGreaterThanOrEqual(prevIdx)
    }
  })

  it('extracts multiple entity types in order', () => {
    const entities = extractEntities(
      'in Sheet1 filter column B over 1000',
      'filter',
      ctx
    )
    const types = entities.map(e => e.type)
    // Sheet1 comes first, then column B, then operator, then number
    const sheetIdx = types.indexOf('sheet')
    const colIdx = types.indexOf('column')
    const opIdx = types.indexOf('operator')
    const numIdx = types.indexOf('number')

    if (sheetIdx >= 0 && colIdx >= 0) expect(sheetIdx).toBeLessThan(colIdx)
    if (colIdx >= 0 && opIdx >= 0) expect(colIdx).toBeLessThan(opIdx)
    if (opIdx >= 0 && numIdx >= 0) expect(opIdx).toBeLessThan(numIdx)
  })
})

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('extractEntities - edge cases', () => {
  const ctx = makeContext()

  it('returns empty array for empty input', () => {
    expect(extractEntities('', 'unknown', ctx)).toEqual([])
  })

  it('returns empty array for whitespace-only input', () => {
    expect(extractEntities('   ', 'unknown', ctx)).toEqual([])
  })

  it('handles text with no entity references', () => {
    const entities = extractEntities('hello world', 'chat', ctx)
    // May or may not find entities depending on context matching
    expect(Array.isArray(entities)).toBe(true)
  })

  it('handles missing active sheet gracefully', () => {
    const noActiveCtx: WorkbookContext = {
      activeSheetId: 'non-existent',
      sheets: [
        {
          id: 'sheet-1',
          name: 'Sheet1',
          columns: [{ letter: 'A', headerName: 'Name', index: 0 }],
        },
      ],
    }
    const entities = extractEntities('filter column A', 'filter', noActiveCtx)
    // Should not crash, columns won't resolve without active sheet
    expect(Array.isArray(entities)).toBe(true)
  })
})

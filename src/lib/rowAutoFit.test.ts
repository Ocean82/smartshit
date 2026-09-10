import { describe, expect, it } from 'vitest'
import {
  CELL_PAD_X,
  DEFAULT_FONT_SIZE,
  autoFitRowHeights,
  lineHeightForFontSize,
  measureWrappedHeight,
  wrapTextLines,
} from './rowAutoFit'
import { DEFAULT_ROW_HEIGHT, MAX_ROW_HEIGHT } from './rowLayout'

/** Fixed-width measurer: each character is `unit` px wide. */
function fixedMeasurer(unit = 10) {
  return (text: string, _fontSize?: number) => text.length * unit
}

describe('lineHeightForFontSize', () => {
  it('scales from the 13px → 18px GridCell baseline', () => {
    expect(lineHeightForFontSize(13)).toBe(18)
    expect(lineHeightForFontSize(26)).toBe(36)
  })
})

describe('wrapTextLines', () => {
  const measure = fixedMeasurer(10)

  it('keeps short text on one line', () => {
    expect(wrapTextLines('hello', 100, measure)).toEqual(['hello'])
  })

  it('wraps on word boundaries', () => {
    expect(wrapTextLines('one two three', 50, measure)).toEqual(['one ', 'two ', 'three'])
  })

  it('preserves explicit newlines', () => {
    expect(wrapTextLines('a\nb\nc', 100, measure)).toEqual(['a', 'b', 'c'])
  })

  it('hard-breaks oversized tokens', () => {
    expect(wrapTextLines('abcdefghij', 30, measure)).toEqual(['abc', 'def', 'ghi', 'j'])
  })
})

describe('measureWrappedHeight', () => {
  it('returns at least one line box for empty/short text', () => {
    const h = measureWrappedHeight({
      text: 'hi',
      contentWidth: 100,
      measureWidth: fixedMeasurer(10),
    })
    expect(h).toBe(lineHeightForFontSize(DEFAULT_FONT_SIZE) + 4)
  })

  it('grows with wrapped lines', () => {
    const h = measureWrappedHeight({
      text: 'one two three four five six',
      contentWidth: 40,
      measureWidth: fixedMeasurer(10),
    })
    expect(h).toBeGreaterThan(DEFAULT_ROW_HEIGHT)
  })

  it('clamps to MAX_ROW_HEIGHT', () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
    const h = measureWrappedHeight({
      text: long,
      contentWidth: 20,
      measureWidth: fixedMeasurer(10),
    })
    expect(h).toBe(MAX_ROW_HEIGHT)
  })
})

describe('autoFitRowHeights', () => {
  const measure = (text: string, fontSize: number) => text.length * (fontSize * 0.55)

  it('raises height for wrapped cells and leaves non-wrap rows alone', () => {
    const sheet = {
      cells: {
        A1: { value: 'alpha beta gamma delta epsilon', format: { textWrap: true } },
        A2: { value: 'no wrap here at all', format: { bold: true } },
      },
      columnWidths: { 0: 40 },
      rowHeights: {},
    }
    const next = autoFitRowHeights(
      sheet,
      [0, 1],
      (r, c) => {
        const id = r === 0 && c === 0 ? 'A1' : r === 1 && c === 0 ? 'A2' : ''
        return String(sheet.cells[id as 'A1' | 'A2']?.value ?? '')
      },
      measure,
    )
    expect(next[0]).toBeGreaterThan(DEFAULT_ROW_HEIGHT)
    expect(next[1]).toBeUndefined()
  })

  it('uses the tallest wrapped cell in the row', () => {
    const sheet = {
      cells: {
        A1: { value: 'short', format: { textWrap: true } },
        B1: {
          value: 'one two three four five six seven eight',
          format: { textWrap: true },
        },
      },
      columnWidths: { 0: 80, 1: 40 },
      rowHeights: { 0: DEFAULT_ROW_HEIGHT },
    }
    const shortOnly = autoFitRowHeights(
      { ...sheet, cells: { A1: sheet.cells.A1 } },
      [0],
      () => 'short',
      measure,
    )
    const withTall = autoFitRowHeights(
      sheet,
      [0],
      (_r, c) => (c === 0 ? 'short' : String(sheet.cells.B1.value)),
      measure,
    )
    expect(withTall[0]).toBeGreaterThan(shortOnly[0] ?? DEFAULT_ROW_HEIGHT)
  })

  it('accounts for CELL_PAD_X when computing content width', () => {
    expect(CELL_PAD_X).toBe(12)
  })
})

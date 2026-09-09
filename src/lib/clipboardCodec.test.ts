import { describe, expect, it } from 'vitest'
import type { CellData } from '@/types'
import { parseGridClipboard, encodeCellBlock } from './clipboardCodec'

describe('clipboard codec', () => {
  it('round-trips a 2x2 block through TSV', () => {
    const cells: Record<string, CellData> = {
      A1: { value: 'a', format: { bold: true } },
      B1: { value: 2 },
      A2: { value: 'x' },
      B2: { value: 'z' },
    }
    const text = encodeCellBlock(cells, { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }).tsv
    expect(text).toBe('a\t2\nx\tz')
    const parsed = parseGridClipboard(text, 'tsv')
    expect(parsed).not.toBeNull()
    expect(parsed?.rect).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(parsed?.cellRefs.sort()).toEqual(['A1', 'A2', 'B1', 'B2'])
  })

  it('emits formula when present and preserves spacing in values', () => {
    const cells: Record<string, CellData> = {
      A1: { value: '  spaced  ' },
      B1: { formula: '=SUM(A1:A2)', value: 3 },
    }
    const { tsv } = encodeCellBlock(cells, { startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
    expect(tsv).toBe('  spaced  \t=SUM(A1:A2)')
    const parsed = parseGridClipboard(tsv, 'tsv')
    expect(parsed?.cellRefs.sort()).toEqual(['A1', 'B1'])
    expect(parsed?.valuesByRef['A1']).toBe('  spaced  ')
  })

  it('emits tab separators for empty middle columns (rect preserved)', () => {
    const cells: Record<string, CellData> = {
      A1: { value: 'left' },
      C1: { value: 'right' },
    }
    const { tsv } = encodeCellBlock(cells, { startRow: 0, startCol: 0, endRow: 0, endCol: 2 })
    expect(tsv).toBe('left\t\tright')
    const parsed = parseGridClipboard(tsv, 'tsv')
    expect(parsed?.rect).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 2 })
    expect(parsed?.cellRefs.sort()).toEqual(['A1', 'C1'])
  })

  it('parses CSV with quoted fields containing commas', () => {
    const parsed = parseGridClipboard('a,"b,c",d', 'csv')
    expect(parsed?.cellRefs.sort()).toEqual(['A1', 'B1', 'C1'])
    expect(parsed?.rect).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 2 })
    expect(parsed?.valuesByRef['B1']).toBe('b,c')
  })

  it('returns null for unparseable text', () => {
    expect(parseGridClipboard('', 'text')).toBeNull()
    expect(parseGridClipboard('   ', 'tsv')).toBeNull()
  })

  it('handles CRLF line endings in text format', () => {
    const parsed = parseGridClipboard('a\r\nb', 'text')
    expect(parsed?.cellRefs.sort()).toEqual(['A1', 'A2'])
    expect(parsed?.rect).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 0 })
  })
})
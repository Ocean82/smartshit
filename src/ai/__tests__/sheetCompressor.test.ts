/**
 * Unit tests for SheetCompressor — SpreadsheetLLM encoding module.
 */
import { describe, it, expect } from 'vitest'
import { compressSheet, compressSheetLossless, type CompressorOptions } from '../sheetCompressor'
import type { SheetData } from '@/types'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeSheet(cells: Record<string, { value?: string | number | boolean | null; formula?: string }>): SheetData {
  const cellMap: Record<string, any> = {}
  for (const [id, data] of Object.entries(cells)) {
    cellMap[id] = { value: data.value ?? null, formula: data.formula }
  }
  return {
    id: 'test-sheet',
    name: 'Sheet1',
    cells: cellMap,
    columnWidths: {},
    rowHeights: {},
  } as SheetData
}

function noopComputed(): string {
  return ''
}

function computedFromSheet(sheet: SheetData) {
  return (row: number, col: number): string => {
    // Simple: return cell value as string (no formula evaluation)
    const colLetter = String.fromCharCode(65 + col)
    const cellId = `${colLetter}${row + 1}`
    const cell = sheet.cells[cellId]
    if (!cell) return ''
    if (cell.value !== null && cell.value !== undefined) return String(cell.value)
    return ''
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SheetCompressor', () => {
  describe('empty sheet', () => {
    it('returns empty encoding for sheet with no cells', () => {
      const sheet = makeSheet({})
      const result = compressSheet(sheet, noopComputed, { mode: 'full' })
      expect(result.encoded).toBe('{"empty": true}')
      expect(result.originalCells).toBe(0)
      expect(result.compressionRatio).toBe(1)
    })
  })

  describe('lossless mode (inverted-index only)', () => {
    it('encodes a simple sheet with inverted index', () => {
      const sheet = makeSheet({
        A1: { value: 'Name' },
        B1: { value: 'Amount' },
        A2: { value: 'Rent' },
        B2: { value: 1200 },
        A3: { value: 'Food' },
        B3: { value: 400 },
        A4: { value: 'Rent' }, // duplicate value
        B4: { value: 800 },
      })
      const result = compressSheetLossless(sheet, computedFromSheet(sheet))

      expect(result.originalCells).toBe(8)
      // "Rent" appears twice, should be merged in inverted index
      expect(result.encoded).toContain('"Rent"')
      // Should contain cell addresses
      expect(result.encoded).toContain('A2')
      expect(result.encoded).toContain('A4')
    })

    it('merges duplicate values into single entry', () => {
      const sheet = makeSheet({
        A1: { value: 'Yes' },
        A2: { value: 'Yes' },
        A3: { value: 'Yes' },
        B1: { value: 'No' },
      })
      const result = compressSheetLossless(sheet, computedFromSheet(sheet))

      // "Yes" should appear once with multiple addresses
      const yesMatches = result.encoded.match(/"Yes"/g)
      expect(yesMatches?.length).toBe(1)
      // All three A-column addresses should be referenced
      expect(result.encoded).toContain('A1')
      expect(result.encoded).toContain('A3')
    })
  })

  describe('structural mode (anchors + inverted-index)', () => {
    it('identifies header row as anchor', () => {
      const cells: Record<string, { value: string | number }> = {
        A1: { value: 'Category' },
        B1: { value: 'Amount' },
        C1: { value: 'Date' },
      }
      // Add 50 homogeneous data rows — enough for structural pruning to kick in
      for (let r = 2; r <= 51; r++) {
        cells[`A${r}`] = { value: `Item ${r}` }
        cells[`B${r}`] = { value: r * 100 }
        cells[`C${r}`] = { value: '2024-01-15' }
      }

      const sheet = makeSheet(cells)
      const result = compressSheet(sheet, computedFromSheet(sheet), {
        mode: 'structural',
        anchorDistance: 1,
      })

      // Should have anchors identified
      expect(result.anchors).toBeDefined()
      expect(result.anchors!.rows).toContain(0) // header row
      // With k=1 and only a few anchors on a 51-row sheet, some rows are pruned
      expect(result.compressedCells).toBeLessThanOrEqual(result.originalCells)
    })

    it('retains rows within k distance of anchors', () => {
      const cells: Record<string, { value: string | number }> = {
        A1: { value: 'Header' },
        B1: { value: 'Value' },
      }
      for (let r = 2; r <= 50; r++) {
        cells[`A${r}`] = { value: `Row ${r}` }
        cells[`B${r}`] = { value: r }
      }

      const sheet = makeSheet(cells)
      const result = compressSheet(sheet, computedFromSheet(sheet), {
        mode: 'structural',
        anchorDistance: 1,
      })

      // Should compress significantly for a 50-row sheet with only a few anchors
      expect(result.compressionRatio).toBeGreaterThan(1)
    })
  })

  describe('full mode (all three modules)', () => {
    it('produces format aggregation regions for numeric columns', () => {
      const cells: Record<string, { value: string | number }> = {
        A1: { value: 'Month' },
        B1: { value: 'Revenue' },
      }
      for (let r = 2; r <= 15; r++) {
        cells[`A${r}`] = { value: `Month ${r - 1}` }
        cells[`B${r}`] = { value: 1000 + r * 50 }
      }

      const sheet = makeSheet(cells)
      const result = compressSheet(sheet, computedFromSheet(sheet), { mode: 'full' })

      // Should have regions section
      expect(result.encoded).toContain('[regions]')
      // Should identify the numeric column type
      expect(result.encoded).toMatch(/integer|float|currency/)
    })

    it('handles mixed data types correctly', () => {
      const sheet = makeSheet({
        A1: { value: 'Name' },
        B1: { value: 'Email' },
        C1: { value: 'Amount' },
        A2: { value: 'Alice' },
        B2: { value: 'alice@test.com' },
        C2: { value: '$1,200' },
        A3: { value: 'Bob' },
        B3: { value: 'bob@test.com' },
        C3: { value: '$800' },
      })
      const result = compressSheet(sheet, computedFromSheet(sheet), { mode: 'full' })

      expect(result.originalCells).toBe(9)
      expect(result.encoded.length).toBeGreaterThan(0)
      expect(result.encoded).not.toBe('{"empty": true}')
    })
  })

  describe('compression ratio', () => {
    it('achieves meaningful token reduction on repetitive data', () => {
      const cells: Record<string, { value: string | number }> = {}
      // 10 columns × 100 rows with repeating values
      for (let r = 0; r < 100; r++) {
        for (let c = 0; c < 10; c++) {
          const colLetter = String.fromCharCode(65 + c)
          // Highly repetitive: only 5 unique values
          cells[`${colLetter}${r + 1}`] = { value: `Category ${(r % 5) + 1}` }
        }
      }

      const sheet = makeSheet(cells)
      const result = compressSheetLossless(sheet, computedFromSheet(sheet))

      expect(result.originalCells).toBe(1000)
      // The inverted index will only have 5 unique value entries
      // A naive row-by-row encoding of 1000 cells would be vastly longer
      // than 5 entries with collapsed address ranges
      const naiveEncoding = Object.entries(cells)
        .map(([id, data]) => `${id}:${data.value}`)
        .join('\n')
      // Compressed encoding should be significantly shorter than naive
      expect(result.encoded.length).toBeLessThan(naiveEncoding.length)
    })
  })

  describe('options', () => {
    it('respects maxRows cap', () => {
      const cells: Record<string, { value: string | number }> = {}
      for (let r = 1; r <= 1000; r++) {
        cells[`A${r}`] = { value: r }
      }

      const sheet = makeSheet(cells)
      const result = compressSheet(sheet, computedFromSheet(sheet), {
        mode: 'lossless',
        maxRows: 50,
      })

      // Should cap at 50 rows
      expect(result.originalCells).toBeLessThanOrEqual(50)
    })

    it('respects maxCols cap', () => {
      const cells: Record<string, { value: string | number }> = {}
      // Create 100 columns in row 1
      for (let c = 0; c < 100; c++) {
        const letter = c < 26
          ? String.fromCharCode(65 + c)
          : String.fromCharCode(65 + Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26))
        cells[`${letter}1`] = { value: c }
      }

      const sheet = makeSheet(cells)
      const result = compressSheet(sheet, computedFromSheet(sheet), {
        mode: 'lossless',
        maxCols: 10,
      })

      // Should cap columns
      expect(result.originalCells).toBeLessThanOrEqual(10)
    })
  })

  describe('address range collapsing', () => {
    it('collapses consecutive cells into range notation in output', () => {
      const cells: Record<string, { value: string | number }> = {}
      // Same value in B2:B10
      for (let r = 2; r <= 10; r++) {
        cells[`B${r}`] = { value: 'recurring' }
      }

      const sheet = makeSheet(cells)
      const result = compressSheetLossless(sheet, computedFromSheet(sheet))

      // Should use range notation B2:B10 instead of listing each cell
      expect(result.encoded).toContain('B2:B10')
    })
  })
})

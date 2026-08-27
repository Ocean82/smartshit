/**
 * Script Preview Builder — Unit Tests
 *
 * Verifies that `execute_script` actions produce a collect-only (dry-run)
 * preview of the exact changes before they are applied, so the user can
 * approve or decline.
 */

import { describe, it, expect } from 'vitest'
import { mutationsToPreview, buildScriptPreview } from '@/lib/scriptPreview'
import type { SheetData } from '@/types'

/** Build a minimal sheet for testing. */
function buildSheet(
  cells: Record<string, { value: string | number | boolean | null; formula?: string; format?: Record<string, unknown> }>,
): SheetData {
  const cellsOut: SheetData['cells'] = {}
  for (const [ref, data] of Object.entries(cells)) {
    cellsOut[ref] = { value: data.value ?? null, formula: data.formula, format: data.format }
  }
  return {
    id: 'test-sheet',
    name: 'Test',
    cells: cellsOut,
    columnWidths: {},
    rowHeights: {},
  }
}

function getComputedFor(sheet: SheetData) {
  return (row: number, col: number): string => {
    const letter = String.fromCharCode(65 + col)
    const cell = sheet.cells[`${letter}${row + 1}`]
    return String(cell?.value ?? '')
  }
}

describe('mutationsToPreview', () => {
  it('converts cell value updates with old/new values', () => {
    const sheet = buildSheet({ A1: { value: 'old' }, B1: { value: 5 } })
    const changes = mutationsToPreview(
      {
        success: true,
        cellUpdates: { A1: { value: 'new' }, B1: { value: '99' }, C1: { value: 'x' } },
        formatUpdates: {},
        rowDeletions: [],
        rowInsertions: [],
        logs: [],
        summary: '',
        executionTime: 1,
      },
      sheet,
    )

    const a1 = changes.find((c) => c.cell === 'A1')
    expect(a1?.oldValue).toBe('old')
    expect(a1?.newValue).toBe('new')

    const b1 = changes.find((c) => c.cell === 'B1')
    expect(b1?.oldValue).toBe(5)
    expect(b1?.newValue).toBe('99')

    const c1 = changes.find((c) => c.cell === 'C1')
    expect(c1?.oldValue).toBeNull()
    expect(c1?.newValue).toBe('x')
  })

  it('preserves formula updates', () => {
    const sheet = buildSheet({ A1: { value: null, formula: '=1+1' } })
    const changes = mutationsToPreview(
      {
        success: true,
        cellUpdates: { A1: { value: null, formula: '=SUM(A:A)' } },
        formatUpdates: {},
        rowDeletions: [],
        rowInsertions: [],
        logs: [],
        summary: '',
        executionTime: 1,
      },
      sheet,
    )

    const a1 = changes.find((c) => c.cell === 'A1')
    expect(a1?.oldFormula).toBe('=1+1')
    expect(a1?.newFormula).toBe('=SUM(A:A)')
  })

  it('describes format updates', () => {
    const sheet = buildSheet({ B2: { value: 10 } })
    const changes = mutationsToPreview(
      {
        success: true,
        cellUpdates: {},
        formatUpdates: { B2: { bold: true, bgColor: '#FEE2E2' } },
        rowDeletions: [],
        rowInsertions: [],
        logs: [],
        summary: '',
        executionTime: 1,
      },
      sheet,
    )

    const b2 = changes.find((c) => c.cell === 'B2')
    expect(b2?.description).toContain('format:')
    expect(b2?.description).toContain('bold=true')
    expect(b2?.description).toContain('bgColor=#FEE2E2')
  })

  it('describes row insertions and deletions', () => {
    const sheet = buildSheet({ A1: { value: 1 } })
    const changes = mutationsToPreview(
      {
        success: true,
        cellUpdates: {},
        formatUpdates: {},
        rowDeletions: [2],
        rowInsertions: [0],
        logs: [],
        summary: '',
        executionTime: 1,
      },
      sheet,
    )

    const insert = changes.find((c) => c.cell === 'Row 1')
    expect(insert?.description).toBe('insert row')
    const del = changes.find((c) => c.cell === 'Row 3')
    expect(del?.description).toBe('delete row')
  })
})

describe('buildScriptPreview', () => {
  it('runs the script in collect-only mode and never mutates the sheet', async () => {
    const sheet = buildSheet({ A1: { value: 1 }, A2: { value: 2 }, A3: { value: 3 } })
    const snapshot = JSON.stringify(sheet.cells)

    const preview = await buildScriptPreview(
      `const sum = getCell("A1") + getCell("A2") + getCell("A3"); setCell("A4", sum); setFormat("A4", { bold: true });`,
      { sheet, getComputedValue: getComputedFor(sheet) },
    )

    expect(preview.success).toBe(true)
    expect(preview.changes?.length).toBe(2)

    const a4 = preview.changes?.find((c) => c.cell === 'A4')
    expect(a4?.newValue).toBe(6)
    expect(a4?.oldValue).toBeNull()

    const fmt = preview.changes?.find((c) => c.description?.startsWith('format:'))
    expect(fmt?.cell).toBe('A4')

    // The preview run must not write anything to the sheet.
    expect(JSON.stringify(sheet.cells)).toBe(snapshot)
  })

  it('returns a failure result when the script throws', async () => {
    const sheet = buildSheet({ A1: { value: 1 } })
    const preview = await buildScriptPreview(`throw new Error("boom")`, {
      sheet,
      getComputedValue: getComputedFor(sheet),
    })

    expect(preview.success).toBe(false)
    expect(preview.error).toBeTruthy()
  })

  it('previews old and new values for changed cells', async () => {
    const sheet = buildSheet({ B1: { value: 10 } })
    const preview = await buildScriptPreview(
      `setCell("B1", getCell("B1") * 2); setCell("B2", "done");`,
      { sheet, getComputedValue: getComputedFor(sheet) },
    )

    expect(preview.success).toBe(true)
    const b1 = preview.changes?.find((c) => c.cell === 'B1')
    expect(b1?.oldValue).toBe(10)
    expect(b1?.newValue).toBe(20)
  })
})

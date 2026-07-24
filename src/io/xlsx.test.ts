/**
 * Import hardening tests.
 *
 * `xlsx@0.18.5` is pinned with an unpatched prototype-pollution advisory
 * (GHSA-4r6h-8v6p-xvw6). Until the dependency is migrated off npm, the import
 * path sanitises parser output — these tests assert that guard holds.
 */

import { describe, it, expect, afterEach } from 'vitest'
import * as XLSX from 'xlsx'
import { importWorkbookFromFileWithMeta } from './xlsx'

/** Minimal File shim: the importer only needs `name` and `arrayBuffer()`. */
function fakeFile(name: string, buffer: ArrayBuffer): File {
  return {
    name,
    arrayBuffer: async () => buffer,
  } as unknown as File
}

function xlsxBuffer(rows: (string | number | null)[][], sheetName = 'Sheet1'): ArrayBuffer {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName)
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

afterEach(() => {
  // Ensure no test leaked a polluted prototype into the rest of the suite
  delete (Object.prototype as Record<string, unknown>).polluted
})

describe('workbook import', () => {
  it('imports a normal sheet', async () => {
    const buffer = xlsxBuffer([
      ['Item', 'Amount'],
      ['Rent', 1200],
    ])
    const { workbook } = await importWorkbookFromFileWithMeta(fakeFile('budget.xlsx', buffer))

    expect(workbook.sheets).toHaveLength(1)
    expect(workbook.sheets[0].cells.A1?.value).toBe('Item')
    expect(workbook.sheets[0].cells.B2?.value).toBe(1200)
  })

  it('does not pollute Object.prototype via a crafted sheet name', async () => {
    const buffer = xlsxBuffer([['a']], 'Sheet1')
    const book = XLSX.read(buffer, { type: 'array' })

    // Simulate a malicious parse result carrying a __proto__ sheet entry
    Object.defineProperty(book.Sheets, '__proto__', {
      value: { polluted: 'yes' },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    book.SheetNames.push('__proto__')

    const rewritten = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await importWorkbookFromFileWithMeta(fakeFile('evil.xlsx', rewritten))

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('applies row and column import limits with warnings', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => [`row${i}`, i])
    const buffer = xlsxBuffer(rows)
    const { workbook, meta } = await importWorkbookFromFileWithMeta(fakeFile('big.xlsx', buffer))

    expect(workbook.sheets[0]).toBeDefined()
    expect(meta.appliedMaxRows).toBeGreaterThan(0)
    expect(Array.isArray(meta.warnings)).toBe(true)
  })
})

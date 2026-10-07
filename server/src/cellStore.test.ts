import { describe, it, expect, vi, beforeEach } from 'vitest'

const statements: string[] = []
let priorHash: string | null = null

vi.mock('./db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn: (q: (text: string) => Promise<unknown>) => Promise<unknown>) => {
    statements.push('BEGIN')
    const result = await fn(async (text: string) => {
      statements.push(text.trim().split(/\s+/).slice(0, 3).join(' '))
      if (text.includes('SELECT version_hash')) {
        return { rows: priorHash ? [{ version_hash: priorHash, cell_count: 2 }] : [] }
      }
      return { rows: [] }
    })
    statements.push('COMMIT')
    return result
  }),
}))

import { syncWorkbookCells, hashWorkbookSheets } from './cellStore.js'

const sheets = [{ name: 'S', cells: { A1: { value: 'Name' }, A2: { value: 1 } } }]

describe('syncWorkbookCells', () => {
  beforeEach(() => {
    statements.length = 0
    priorHash = null
  })

  it('locks the workbook, then replaces cells inside one transaction', async () => {
    const result = await syncWorkbookCells('wb1', sheets)
    expect(result).toEqual({ cellCount: 2 })
    expect(statements[0]).toBe('BEGIN')
    expect(statements[1]).toBe('SELECT pg_advisory_xact_lock(hashtext($1))')
    expect(statements[2]).toMatch(/^SELECT version_hash/)
    expect(statements.slice(3, 5)).toEqual(['DELETE FROM smartsht.cells', 'DELETE FROM smartsht.sheet_meta'])
    expect(statements.at(-2)).toMatch(/^INSERT INTO smartsht.cell_sync/)
    expect(statements.at(-1)).toBe('COMMIT')
  })

  it('skips the rewrite when content is unchanged (checked under the lock)', async () => {
    priorHash = hashWorkbookSheets(sheets)
    expect(await syncWorkbookCells('wb1', sheets)).toEqual({ cellCount: 2, skipped: true })
    expect(statements.some((s) => s.startsWith('DELETE'))).toBe(false)
  })
})

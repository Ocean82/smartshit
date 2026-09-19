/**
 * Soft-delete purge job unit tests (mocked DB + S3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()
const mockDeleteObject = vi.fn(async () => undefined)

vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}))

vi.mock('./s3.js', () => ({
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
}))

import { purgeExpiredDeletedWorkbooks, WORKBOOK_DELETE_GRACE_DAYS } from './workbookPurge.js'

beforeEach(() => {
  mockQuery.mockReset()
  mockDeleteObject.mockReset()
  mockDeleteObject.mockResolvedValue(undefined)
})

describe('purgeExpiredDeletedWorkbooks', () => {
  it('exposes a 30-day grace period', () => {
    expect(WORKBOOK_DELETE_GRACE_DAYS).toBe(30)
  })

  it('no-ops when nothing is due', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
    const result = await purgeExpiredDeletedWorkbooks()
    expect(result).toEqual({ scanned: 0, purged: 0, errors: 0 })
    expect(mockDeleteObject).not.toHaveBeenCalled()
  })

  it('deletes S3 objects then hard-deletes the workbook row', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'wb-1', s3_key: 'smartsht/workbooks/u/wb-1/latest.json' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { s3_key: 'smartsht/workbooks/u/wb-1/v001.json' },
          { s3_key: 'smartsht/workbooks/u/wb-1/v002.json' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // DELETE workbook

    const result = await purgeExpiredDeletedWorkbooks()
    expect(result.scanned).toBe(1)
    expect(result.purged).toBe(1)
    expect(result.errors).toBe(0)

    const deletedKeys = mockDeleteObject.mock.calls.map((c) => c[0]).sort()
    expect(deletedKeys).toEqual([
      'smartsht/workbooks/u/wb-1/latest.json',
      'smartsht/workbooks/u/wb-1/v001.json',
      'smartsht/workbooks/u/wb-1/v002.json',
    ].sort())

    const deleteSql = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('DELETE FROM smartsht.workbooks'),
    )
    expect(deleteSql?.[1]).toEqual(['wb-1'])
  })

  it('counts per-workbook failures without aborting the batch', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 'wb-bad', s3_key: 'k/latest.json' },
          { id: 'wb-ok', s3_key: 'k2/latest.json' },
        ],
      })
      // wb-bad versions query throws
      .mockRejectedValueOnce(new Error('db down'))
      // wb-ok versions
      .mockResolvedValueOnce({ rows: [] })
      // wb-ok delete
      .mockResolvedValueOnce({ rows: [] })

    const result = await purgeExpiredDeletedWorkbooks()
    expect(result.scanned).toBe(2)
    expect(result.purged).toBe(1)
    expect(result.errors).toBe(1)
  })
})

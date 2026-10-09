import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FREE_AUTOFIX_LIFETIME_LIMIT } from '../../shared/config.js'

const mockConfig = { databaseUrl: 'postgres://test' as string | undefined }
vi.mock('./config.js', () => ({ config: mockConfig }))

const queryMock = vi.fn()
vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

describe('auto-fix lifetime metering', () => {
  beforeEach(() => {
    queryMock.mockReset()
    mockConfig.databaseUrl = 'postgres://test'
    vi.resetModules()
  })

  it('Pro is unlimited and never touches the counter', async () => {
    const { reserveAutoFix } = await import('./autofixUsage.js')
    expect(await reserveAutoFix('u', true)).toEqual({ allowed: true, used: null, limit: null })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('reserves with one conditional atomic upsert guarded by the limit', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ used_count: 1 }] })
    const { reserveAutoFix } = await import('./autofixUsage.js')
    expect(await reserveAutoFix('u', false)).toEqual({ allowed: true, used: 1, limit: FREE_AUTOFIX_LIFETIME_LIMIT })

    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/ON CONFLICT/i)
    expect(sql).toMatch(/used_count < \$2/)
    expect(params).toEqual(['u', FREE_AUTOFIX_LIFETIME_LIMIT])
  })

  it('denies when the guarded upsert returns no row (limit reached)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { reserveAutoFix } = await import('./autofixUsage.js')
    expect(await reserveAutoFix('u', false)).toEqual({
      allowed: false,
      used: FREE_AUTOFIX_LIFETIME_LIMIT,
      limit: FREE_AUTOFIX_LIFETIME_LIMIT,
    })
  })

  it('falls back to an in-memory counter when the DB throws, still capped', async () => {
    queryMock.mockRejectedValue(new Error('db down'))
    const { reserveAutoFix } = await import('./autofixUsage.js')
    const results = []
    for (let i = 0; i <= FREE_AUTOFIX_LIFETIME_LIMIT; i++) results.push(await reserveAutoFix('u', false))
    expect(results.slice(0, -1).every((r) => r.allowed)).toBe(true)
    expect(results.at(-1)?.allowed).toBe(false)
  })

  it('uses the in-memory counter when no database is configured', async () => {
    mockConfig.databaseUrl = undefined
    const { reserveAutoFix } = await import('./autofixUsage.js')
    expect((await reserveAutoFix('u', false)).used).toBe(1)
    expect((await reserveAutoFix('u', false)).used).toBe(2)
    expect((await reserveAutoFix('other', false)).used).toBe(1)
    expect(queryMock).not.toHaveBeenCalled()
  })
})

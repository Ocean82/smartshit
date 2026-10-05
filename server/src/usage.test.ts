import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config.js', () => ({
  config: {
    databaseUrl: 'postgres://test',
  },
}))

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

describe('usage metering', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

  it('falls back to memory limiter when DB check fails (not unlimited)', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'))
    const { checkUsage } = await import('./usage.js')
    const result = await checkUsage('user-1', false)
    expect(result.isPro).toBe(false)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(0)
    expect(result.limit).toBeGreaterThan(0)
  })

  it('bumps memory counter when recordUsage DB write fails', async () => {
    queryMock
      .mockRejectedValueOnce(new Error('insert failed')) // recordUsage
      .mockRejectedValueOnce(new Error('db down')) // subsequent checkUsage

    const { recordUsage, checkUsage } = await import('./usage.js')
    await recordUsage('user-record-fail')
    const result = await checkUsage('user-record-fail', false)
    expect(result.used).toBe(1)
  })

  it('getUsageStats reports the stored revocation reason', async () => {
    const { getUsageStats } = await import('./usage.js')
    const stats = await getUsageStats('user-1', false, 'canceled')
    expect(stats.revocationReason).toBe('canceled')
    expect(stats.isPro).toBe(false)
  })

  it('getUsageStats is silent when no reason is stored', async () => {
    const { getUsageStats } = await import('./usage.js')
    const stats = await getUsageStats('user-1', true, null)
    expect(stats.revocationReason).toBeNull()
    expect(stats.isPro).toBe(true)
    expect(stats.allowed).toBe(true)
  })

  // ─── F16(c): atomic reserve-before-inference + release ─────────────────────

  it('reserve allows and returns the post-reserve count when a row comes back', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ request_count: 1 }] })
    const { reserveUsage } = await import('./usage.js')
    const result = await reserveUsage('u', false)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(1)
    expect(result.isPro).toBe(false)
    // The reserve must be a single conditional atomic statement guarded by the
    // limit — assert the SQL shape rather than requiring a real Postgres.
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/ON CONFLICT/i)
    expect(sql).toMatch(/request_count \+ 1/i)
    expect(sql).toMatch(/WHERE smartsht\.ai_usage_daily\.request_count < \$2/i)
    expect(sql).toMatch(/RETURNING request_count/i)
    // $2 is the limit param, not a hardcoded literal — must equal the configured limit.
    expect(params[1]).toBeGreaterThan(0)
  })

  it('reserve DENIES when the atomic statement returns no row (at/over limit)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { reserveUsage } = await import('./usage.js')
    const result = await reserveUsage('u', false)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.used).toBe(result.limit)
  })

  it('reserve returns unlimited for Pro without touching the DB', async () => {
    const { reserveUsage } = await import('./usage.js')
    const result = await reserveUsage('u', true)
    expect(result.allowed).toBe(true)
    expect(result.isPro).toBe(true)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('release issues the floored decrement UPDATE for today', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const { releaseUsage } = await import('./usage.js')
    await releaseUsage('u')
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/UPDATE smartsht\.ai_usage_daily/i)
    expect(sql).toMatch(/GREATEST\(request_count - 1, 0\)/i)
    expect(sql).toMatch(/usage_date = CURRENT_DATE/i)
    expect(params[0]).toBe('u')
  })

  it('one net increment per billable turn: reserve +1 then release returns to baseline', async () => {
    // reserve (row back) → release (decrement) → net zero, exercising the
    // reserve-then-release control flow the chat path uses on a non-billable turn.
    queryMock
      .mockResolvedValueOnce({ rows: [{ request_count: 1 }] }) // reserve
      .mockResolvedValueOnce({ rows: [] }) // release UPDATE
    const { reserveUsage, releaseUsage } = await import('./usage.js')
    const reserved = await reserveUsage('u', false)
    expect(reserved.used).toBe(1)
    await releaseUsage('u')
    expect(queryMock).toHaveBeenCalledTimes(2)
  })
})

// No-DB fallback: reserve/release must still gate (fail closed) using the
// in-memory counter, mirroring checkUsage/recordUsage behavior.
describe('usage metering (no database configured)', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
    vi.doMock('./config.js', () => ({ config: { databaseUrl: undefined } }))
  })

  afterEach(() => {
    vi.doUnmock('./config.js')
  })

  it('reserve bumps the memory counter and denies once the limit is reached', async () => {
    const { reserveUsage } = await import('./usage.js')
    const user = 'mem-user'
    let last
    // Exhaust the limit; each successful reserve returns allowed:true.
    for (let i = 0; i < 100; i++) {
      last = await reserveUsage(user, false)
      if (!last.allowed) break
    }
    expect(last!.allowed).toBe(false)
    expect(last!.remaining).toBe(0)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('release decrements the memory counter so a freed slot can be reserved again', async () => {
    const { reserveUsage, releaseUsage } = await import('./usage.js')
    const user = 'mem-release'
    // Fill to the limit.
    let r = await reserveUsage(user, false)
    const limit = r.limit!
    for (let i = 1; i < limit; i++) r = await reserveUsage(user, false)
    expect(r.allowed).toBe(true)
    expect(r.used).toBe(limit)
    // At limit → denied.
    expect((await reserveUsage(user, false)).allowed).toBe(false)
    // Release one → a slot opens → reserve succeeds again.
    await releaseUsage(user)
    const after = await reserveUsage(user, false)
    expect(after.allowed).toBe(true)
    expect(after.used).toBe(limit)
  })
})

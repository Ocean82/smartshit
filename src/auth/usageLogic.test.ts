import { describe, expect, it } from 'vitest'
import { anonymousUsageState, computeIsPro, runPlanRequest, shouldFetchPlan } from './usageLogic'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('runPlanRequest request-generation guard', () => {
  it('A -> B -> A: the first A response is stale even though the account id matches again', async () => {
    let generation = 1
    const mine = generation
    const response = deferred<unknown>()
    const p = runPlanRequest(async () => 'tok-A', () => response.promise, () => mine === generation)
    await Promise.resolve()
    generation = 2 // switched to B
    generation = 3 // and back to A: same account id, new generation
    response.resolve({ isPro: true })
    expect(await p).toBe('stale')
  })
  it('a stale fetch error is also discarded (not applied as free tier)', async () => {
    let generation = 1
    const response = deferred<unknown>()
    const p = runPlanRequest(async () => 'tok', () => response.promise, () => generation === 1)
    await Promise.resolve()
    generation = 2
    response.reject(new Error('network'))
    expect(await p).toBe('stale')
  })
  it('a token resolved after the switch never fetches', async () => {
    let generation = 1
    const token = deferred<string | null>()
    let fetched = false
    const p = runPlanRequest(
      () => token.promise,
      async () => {
        fetched = true
        return {}
      },
      () => generation === 1,
    )
    generation = 2
    token.resolve('tok')
    expect(await p).toBe('stale')
    expect(fetched).toBe(false)
  })
  it('current request: pro, free with limit/used, retry on null or rejected token', async () => {
    const live = () => true
    expect(await runPlanRequest(async () => 't', async () => ({ isPro: true }), live)).toEqual({ isPro: true })
    expect(await runPlanRequest(async () => 't', async () => ({ limit: 7, used: 2 }), live)).toEqual({
      isPro: false,
      limit: 7,
      used: 2,
    })
    expect(await runPlanRequest(async () => 't', async () => null, live)).toEqual({ isPro: false })
    expect(await runPlanRequest(async () => null, async () => ({}), live)).toBe('retry')
    expect(
      await runPlanRequest(
        () => Promise.reject(new Error('x')),
        async () => ({}),
        live,
      ),
    ).toBe('retry')
  })
})

describe('anonymousUsageState (T10)', () => {
  it('is free-tier, can ask, zero used for anonymous and pending', () => {
    for (const s of ['anonymous', 'pending'] as const) {
      const st = anonymousUsageState(s, 7)!
      expect(st.isPro).toBe(false)
      expect(st.canAsk).toBe(true)
      expect(st.usedToday).toBe(0)
      expect(st.remaining).toBe(Infinity)
    }
  })
  it('is null for signed-in and dev', () => {
    expect(anonymousUsageState('signed-in', 7)).toBeNull()
    expect(anonymousUsageState('dev', 7)).toBeNull()
  })
})

describe('computeIsPro (T10)', () => {
  const base = { claimsPro: false, serverIsPro: null, hasByok: true }
  it('BYOK cannot make an anonymous or pending visitor look unlimited', () => {
    expect(computeIsPro({ ...base, status: 'anonymous' })).toBe(false)
    expect(computeIsPro({ ...base, status: 'pending' })).toBe(false)
  })
  it('BYOK counts for signed-in and dev', () => {
    expect(computeIsPro({ ...base, status: 'signed-in' })).toBe(true)
    expect(computeIsPro({ ...base, status: 'dev' })).toBe(true)
  })
  it('claims or server pro always count', () => {
    expect(computeIsPro({ status: 'signed-in', claimsPro: true, serverIsPro: null, hasByok: false })).toBe(true)
    expect(computeIsPro({ status: 'signed-in', claimsPro: false, serverIsPro: true, hasByok: false })).toBe(true)
  })
})

describe('shouldFetchPlan (T10b)', () => {
  const ok = { status: 'signed-in' as const, claimsPro: false, hasByok: false, inFlight: false, done: false }
  it('never for anonymous, pending or dev (getToken is never called)', () => {
    for (const status of ['anonymous', 'pending', 'dev'] as const) {
      expect(shouldFetchPlan({ ...ok, status })).toBe(false)
    }
  })
  it('true for signed-in, including after an earlier anonymous false (no latch)', () => {
    expect(shouldFetchPlan({ ...ok, status: 'anonymous' })).toBe(false)
    expect(shouldFetchPlan(ok)).toBe(true)
  })
  it('false when in flight, done, claimsPro or hasByok', () => {
    expect(shouldFetchPlan({ ...ok, inFlight: true })).toBe(false)
    expect(shouldFetchPlan({ ...ok, done: true })).toBe(false)
    expect(shouldFetchPlan({ ...ok, claimsPro: true })).toBe(false)
    expect(shouldFetchPlan({ ...ok, hasByok: true })).toBe(false)
  })
})
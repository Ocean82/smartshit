/**
 * Integration tests for /api/ai-function routes — auth, atomic usage metering,
 * batch quota reservation, and batch BYOK handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const LIMIT = 7
let mockUserId: string | null = 'user_123'
let mockIsPro = false
let usedToday = 0

vi.mock('../auth/clerk.js', () => ({
  requireAuth: (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!mockUserId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    next()
  },
  getRequestUserId: () => mockUserId,
}))

vi.mock('../plan.js', () => ({
  resolveIsPro: async () => mockIsPro,
}))

// Same contract as usage.ts: reserve is an atomic check-and-increment.
vi.mock('../usage.js', () => ({
  reserveUsage: vi.fn(async (_userId: string | undefined, isPro: boolean) => {
    if (isPro) return { allowed: true, remaining: null, limit: null, used: 0, isPro: true }
    if (usedToday >= LIMIT) return { allowed: false, remaining: 0, limit: LIMIT, used: usedToday, isPro: false }
    usedToday++
    return { allowed: true, remaining: LIMIT - usedToday, limit: LIMIT, used: usedToday, isPro: false }
  }),
  releaseUsage: vi.fn(async () => {
    usedToday = Math.max(0, usedToday - 1)
  }),
  recordUsage: vi.fn(async () => {
    usedToday++
  }),
}))

const callProvider = vi.fn(async () => ({ text: 'Food' }))
vi.mock('../providers.js', () => ({
  providerOrder: () => ['groq'],
  providerIsConfigured: () => true,
  callProvider: (...args: unknown[]) => callProvider(...(args as [])),
}))

vi.mock('../middleware/rateLimit.js', () => ({
  aiFunctionRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../schemas/byok.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../schemas/byok.js')>()),
  assertPublicByokHost: vi.fn(async () => undefined),
}))

const processBatch = vi.fn()
const estimateBatchCost = vi.fn()
vi.mock('../batch.js', () => ({
  processBatch: (...args: unknown[]) => processBatch(...args),
  estimateBatchCost: (...args: unknown[]) => estimateBatchCost(...args),
}))

import { aiFunctionRouter } from './aiFunction'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/ai-function', aiFunctionRouter)
  return app
}

const BYOK = { apiKey: 'sk-user', baseUrl: 'https://api.openai.com/v1' }
const app = createApp()

beforeEach(() => {
  mockUserId = 'user_123'
  mockIsPro = false
  usedToday = 0
  callProvider.mockReset().mockResolvedValue({ text: 'Food' })
  processBatch.mockReset().mockResolvedValue({ results: [], uniqueInputs: 0, llmCalls: 0 })
  estimateBatchCost.mockReset().mockReturnValue({ uniqueInputs: 0, estimatedCalls: 0, cachedCount: 0 })
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('/api/ai-function — authentication', () => {
  it('returns 401 for every route without auth', async () => {
    mockUserId = null
    for (const path of ['/api/ai-function', '/api/ai-function/batch']) {
      const res = await request(app).post(path).send({ function: 'AI.CATEGORIZE', args: { input: 'x' } })
      expect(res.status).toBe(401)
    }
  })
})

describe('/api/ai-function — usage metering', () => {
  const call = () => request(app).post('/api/ai-function').send({ function: 'AI.CATEGORIZE', args: { input: 'Groceries' } })

  it('cannot be overrun by parallel requests', async () => {
    usedToday = LIMIT - 2
    const statuses = (await Promise.all(Array.from({ length: 6 }, call))).map((r) => r.status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(2)
    expect(statuses.filter((s) => s === 429)).toHaveLength(4)
    expect(usedToday).toBe(LIMIT)
  })

  it('gives the slot back when every provider fails', async () => {
    callProvider.mockRejectedValue(new Error('upstream down'))
    const res = await call()
    expect(res.status).toBe(502)
    expect(usedToday).toBe(0)
  })

  it('does not meter Pro users', async () => {
    mockIsPro = true
    usedToday = 100
    expect((await call()).status).toBe(200)
    expect(usedToday).toBe(100)
  })
})

describe('/api/ai-function/batch', () => {
  const inputs = [
    { id: 'a', function: 'AI.CATEGORIZE', args: { input: 'coffee' } },
    { id: 'b', function: 'AI.SENTIMENT', args: { input: 'great' } },
  ]

  it('rejects malformed bodies', async () => {
    expect((await request(app).post('/api/ai-function/batch').send({ inputs: [] })).status).toBe(400)
    expect((await request(app).post('/api/ai-function/batch').send({ inputs: [{ id: 'a' }] })).status).toBe(400)
  })

  it('denies a batch that needs more calls than the user has left, consuming nothing', async () => {
    usedToday = LIMIT - 1
    estimateBatchCost.mockReturnValue({ uniqueInputs: 2, estimatedCalls: 2, cachedCount: 0 })
    const res = await request(app).post('/api/ai-function/batch').send({ inputs })
    expect(res.status).toBe(429)
    expect(processBatch).not.toHaveBeenCalled()
    expect(usedToday).toBe(LIMIT - 1)
  })

  it('meters only the calls that actually ran', async () => {
    estimateBatchCost.mockReturnValue({ uniqueInputs: 2, estimatedCalls: 2, cachedCount: 0 })
    processBatch.mockResolvedValue({ results: [], uniqueInputs: 2, llmCalls: 1 })
    const res = await request(app).post('/api/ai-function/batch').send({ inputs })
    expect(res.status).toBe(200)
    expect(usedToday).toBe(1)
  })

  it('uses top-level BYOK without metering', async () => {
    usedToday = LIMIT
    const res = await request(app).post('/api/ai-function/batch').send({ inputs, byok: BYOK })
    expect(res.status).toBe(200)
    expect(processBatch).toHaveBeenCalledWith(expect.any(Array), { byok: expect.objectContaining(BYOK) })
    expect(usedToday).toBe(LIMIT)
  })

  it('accepts legacy BYOK in args but strips it before processing', async () => {
    const legacy = inputs.map((i) => ({ ...i, args: { ...i.args, byok: BYOK } }))
    await request(app).post('/api/ai-function/batch').send({ inputs: legacy })
    const [passedInputs, options] = processBatch.mock.calls[0] as [Array<{ args: Record<string, unknown> }>, unknown]
    expect(passedInputs.every((i) => !('byok' in i.args))).toBe(true)
    expect(options).toEqual({ byok: expect.objectContaining(BYOK) })
  })
})

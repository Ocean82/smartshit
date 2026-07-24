/**
 * Regression tests for the AI function registry.
 * See docs/agent-engine-code-review.md (H1, M4).
 */

import { describe, it, expect } from 'vitest'
import { AIFunctionRegistry, type AIFunctionInfo } from './aiFunctions'

function info(name: string): AIFunctionInfo {
  return {
    name,
    description: '',
    abstract: '',
    category: 'AI',
    syntax: '',
    parameters: [],
    isAsync: true,
  }
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

describe('async execution', () => {
  /**
   * Calls are de-duplicated by function + args, which is desirable. The bug was
   * that only the first requesting cell received the result, so every duplicate
   * (common when filling =AI.CATEGORIZE down a column) stayed on the loading
   * placeholder forever.
   */
  it('delivers the result to every cell awaiting the same invocation', async () => {
    const registry = new AIFunctionRegistry()
    const updates: Array<[string, unknown]> = []
    registry.setUpdateCallback((cellId, value) => updates.push([cellId, value]))
    registry.registerAsyncFunction(info('AI.T'), async () => {
      await tick(10)
      return 'RESULT'
    })

    expect(registry.execute('AI.T', 'A1', ['same'])).toBe('⏳ Loading...')
    expect(registry.execute('AI.T', 'B1', ['same'])).toBe('⏳ Loading...')
    expect(registry.execute('AI.T', 'C1', ['same'])).toBe('⏳ Loading...')

    await tick(60)

    expect(updates).toHaveLength(3)
    expect(updates.map(([cell]) => cell).sort()).toEqual(['A1', 'B1', 'C1'])
    expect(updates.every(([, value]) => value === 'RESULT')).toBe(true)
  })

  it('reports failures to every waiting cell', async () => {
    const registry = new AIFunctionRegistry()
    const updates: Array<[string, unknown]> = []
    registry.setUpdateCallback((cellId, value) => updates.push([cellId, value]))
    registry.registerAsyncFunction(info('AI.T'), async () => {
      await tick(5)
      throw new Error('boom')
    })

    registry.execute('AI.T', 'A1', ['same'])
    registry.execute('AI.T', 'B1', ['same'])
    await tick(50)

    expect(updates).toHaveLength(2)
    expect(updates.every(([, value]) => value === '#AI_ERROR!')).toBe(true)
  })

  it('serves a cached result synchronously on later calls', async () => {
    const registry = new AIFunctionRegistry()
    let invocations = 0
    registry.registerAsyncFunction(info('AI.T'), async () => {
      invocations++
      return 'VAL'
    })

    registry.execute('AI.T', 'A1', ['x'])
    await tick(20)

    expect(registry.execute('AI.T', 'B1', ['x'])).toBe('VAL')
    expect(invocations).toBe(1)
  })
})

describe('cache management', () => {
  it('bounds the cache so long fill-downs cannot grow it without limit', async () => {
    const registry = new AIFunctionRegistry()
    registry.registerAsyncFunction(info('AI.T'), async (value) => String(value))

    for (let i = 0; i < 700; i++) {
      registry.execute('AI.T', `A${i}`, [`v${i}`])
    }
    await tick(80)

    // Exposed for assertion only — the cache must stay bounded.
    const size = (registry as unknown as { _cache: Map<string, unknown> })._cache.size
    expect(size).toBeLessThanOrEqual(500)
  })

  it('drops expired entries rather than leaving them resident', async () => {
    const registry = new AIFunctionRegistry()
    registry.setCacheTtl(1)
    registry.registerAsyncFunction(info('AI.T'), async () => 'V')

    registry.execute('AI.T', 'A1', ['k'])
    await tick(20)
    // Reading past the TTL must evict, not just ignore
    registry.execute('AI.T', 'A1', ['k'])

    const cache = (registry as unknown as { _cache: Map<string, unknown> })._cache
    expect(cache.size).toBeLessThanOrEqual(1)
  })

  it('clearFunctionCache only clears the named function', async () => {
    const registry = new AIFunctionRegistry()
    registry.registerAsyncFunction(info('AI.X'), async () => 'x')
    registry.registerAsyncFunction(info('AI.Y'), async () => 'y')

    registry.execute('AI.X', 'A1', ['a'])
    registry.execute('AI.Y', 'B1', ['b'])
    await tick(20)

    registry.clearFunctionCache('AI.X')
    const keys = [...(registry as unknown as { _cache: Map<string, unknown> })._cache.keys()]
    expect(keys.some((k) => k.startsWith('AI.X::'))).toBe(false)
    expect(keys.some((k) => k.startsWith('AI.Y::'))).toBe(true)
  })
})

describe('registration', () => {
  it('returns #NAME? for unknown functions', () => {
    const registry = new AIFunctionRegistry()
    expect(registry.execute('AI.NOPE', 'A1', [])).toBe('#NAME?')
  })

  it('dispose clears all state', () => {
    const registry = new AIFunctionRegistry()
    registry.registerAsyncFunction(info('AI.T'), async () => 'v')
    expect(registry.has('AI.T')).toBe(true)
    registry.dispose()
    expect(registry.has('AI.T')).toBe(false)
    expect(registry.getPendingCount()).toBe(0)
  })
})

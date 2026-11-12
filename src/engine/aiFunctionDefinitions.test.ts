import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIFunctionRegistry } from './aiFunctions'
import { registerBuiltinAIFunctions, setAnonAIFunctionNotifier } from './aiFunctionDefinitions'
import { _resetServerAccessForTests, setAuthStatus } from '@/lib/serverAccess'
import { setAuthTokenProvider } from '@/lib/cloudSync'
import * as userApiKey from '@/lib/userApiKey'

function setup() {
  const registry = new AIFunctionRegistry()
  registerBuiltinAIFunctions(registry)
  const results: Array<string | number | boolean | null> = []
  registry.setUpdateCallback((_s, _c, v) => results.push(v))
  return { registry, results }
}
const flush = async () => {
  await vi.advanceTimersByTimeAsync(50)
}

describe('AI.* transport gate (T3)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    _resetServerAccessForTests()
    fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: 'FROM_SERVER' }) }))
    vi.stubGlobal('fetch', fetchSpy)
    setAnonAIFunctionNotifier(null)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    _resetServerAccessForTests()
    setAnonAIFunctionNotifier(null)
  })

  it('anonymous: no fetch, local fallback value, one notification per session', async () => {
    setAuthStatus('anonymous')
    const notify = vi.fn()
    setAnonAIFunctionNotifier(notify)
    const { registry, results } = setup()
    registry.execute('AI.CATEGORIZE', 'A1', ['Starbucks coffee'], 's1')
    registry.execute('AI.SENTIMENT', 'A2', ['great and wonderful'], 's1')
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(results).toContain('Food & Dining')
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('anonymous batch path (more than 3 calls): no fetch', async () => {
    setAuthStatus('anonymous')
    const { registry } = setup()
    for (let i = 0; i < 5; i++) registry.execute('AI.CATEGORIZE', `A${i}`, [`item ${i}`], 's1')
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('pending then signed-in: the request is made and the server value used', async () => {
    const { registry, results } = setup()
    registry.execute('AI.CATEGORIZE', 'A1', ['Starbucks coffee'], 's1')
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    setAuthStatus('signed-in')
    await flush()
    expect(fetchSpy).toHaveBeenCalled()
    expect(results).toContain('FROM_SERVER')
  })

  it('pending then anonymous: fallback, no fetch', async () => {
    const { registry, results } = setup()
    registry.execute('AI.CATEGORIZE', 'A1', ['Starbucks coffee'], 's1')
    setAuthStatus('anonymous')
    await flush()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(results).toContain('Food & Dining')
  })

  it('pending that never settles: fallback after the 3 s wait, no fetch', async () => {
    const { registry, results } = setup()
    registry.execute('AI.CATEGORIZE', 'A1', ['Starbucks coffee'], 's1')
    await vi.advanceTimersByTimeAsync(3100)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(results).toContain('Food & Dining')
  })

  for (const [label, count] of [['single', 1], ['batch', 5]] as const) {
    it(`sign-out while auth headers resolve (${label}): local fallback, no fetch, no BYOK read`, async () => {
      setAuthStatus('signed-in')
      let release!: (t: string) => void
      const token = new Promise<string>((r) => { release = r })
      setAuthTokenProvider(() => token)
      const byokRead = vi.spyOn(userApiKey, 'getByokPayload')
      const { registry, results } = setup()
      for (let i = 0; i < count; i++) registry.execute('AI.CATEGORIZE', `A${i}`, ['Starbucks coffee'], 's1')
      await flush()
      setAuthStatus('anonymous')
      release('tok')
      await flush()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(byokRead).not.toHaveBeenCalled()
      expect(results.filter((r) => r === 'Food & Dining')).toHaveLength(count)
      setAuthTokenProvider(null)
      byokRead.mockRestore()
    })
  }

  it('signed-in: server is called', async () => {
    setAuthStatus('signed-in')
    const { registry, results } = setup()
    registry.execute('AI.CATEGORIZE', 'A1', ['Starbucks coffee'], 's1')
    await flush()
    expect(fetchSpy).toHaveBeenCalled()
    expect(results).toContain('FROM_SERVER')
  })
})
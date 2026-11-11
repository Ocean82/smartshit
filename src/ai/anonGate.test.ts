import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anonGatedMetadata, isAnonGated } from './anonGate'
import {
  chatWithAgentServer,
  chatWithAgentServerStream,
  fetchServerHealth,
  type AgentServerError,
} from './agentClient'
import { ANON_CHAT_MESSAGE } from '@/auth/anonCopy'
import { _resetServerAccessForTests, setAuthStatus } from '@/lib/serverAccess'
import { resetServerHealthForTests, subscribeServerHealth } from './serverHealth'

const request = {
  message: 'write a short poem about my budget',
  context: {} as never,
  history: [],
}

describe('anon gate helpers', () => {
  it('isAnonGated is true only for code anon-gated', () => {
    const gated: AgentServerError = { kind: 'server-error', status: 'auth', httpStatus: 0, message: 'x', code: 'anon-gated' }
    const refused: AgentServerError = { kind: 'server-error', status: 'auth', httpStatus: 401, message: 'x' }
    expect(isAnonGated(gated)).toBe(true)
    expect(isAnonGated(refused)).toBe(false)
    expect(isAnonGated(null)).toBe(false)
  })
  it('metadata keeps ai-server-refused source so the message is not swallowed', () => {
    expect(anonGatedMetadata()).toEqual({
      toolUsed: 'anon-gated',
      source: 'ai-server-refused',
      signInAction: 'chat',
    })
  })
})

describe('agentClient transport gate (T2)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    _resetServerAccessForTests()
    fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), body: null }))
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    _resetServerAccessForTests()
    resetServerHealthForTests()
  })

  it('anonymous: both chat functions and health make zero requests', async () => {
    setAuthStatus('anonymous')
    const a = await chatWithAgentServer(request)
    const b = await chatWithAgentServerStream({ ...request, onToken: () => {} })
    const h = await fetchServerHealth()
    for (const r of [a, b]) {
      expect(isAnonGated(r)).toBe(true)
      expect((r as AgentServerError).message).toBe(ANON_CHAT_MESSAGE)
      expect((r as AgentServerError).httpStatus).toBe(0)
    }
    expect(h).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('signed-in: requests are made (regression guard)', async () => {
    setAuthStatus('signed-in')
    await chatWithAgentServer(request)
    await fetchServerHealth()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('pending that settles signed-in reaches the server', async () => {
    const p = chatWithAgentServer(request)
    setAuthStatus('signed-in')
    await p
    expect(fetchSpy).toHaveBeenCalled()
  })

  it('health poller does not poll while anonymous and starts after sign-in', async () => {
    setAuthStatus('anonymous')
    const seen: unknown[] = []
    const off = subscribeServerHealth((h) => seen.push(h))
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
    setAuthStatus('signed-in')
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    off()
  })
})
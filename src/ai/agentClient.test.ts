import { describe, expect, it } from 'vitest'
import { parseCompleteSseEvent, serverResponseToChatMessage } from './agentClient'

describe('parseCompleteSseEvent', () => {
  it('retains provider meta from complete events', () => {
    const raw = JSON.stringify({
      type: 'complete',
      message: 'Sorted column B',
      actions: [],
      source: 'llm',
      meta: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    })
    const parsed = parseCompleteSseEvent(raw)
    expect(parsed).not.toBeNull()
    expect(parsed!.meta).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    })
  })

  it('returns null for token events', () => {
    expect(parseCompleteSseEvent(JSON.stringify({ type: 'token', content: 'hi' }))).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseCompleteSseEvent('{not-json')).toBeNull()
  })
})

describe('serverResponseToChatMessage', () => {
  it('copies provider meta onto ChatMessage', () => {
    const msg = serverResponseToChatMessage({
      message: 'Done',
      actions: [],
      source: 'llm',
      meta: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    })
    expect(msg.providerMeta).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    })
  })
})

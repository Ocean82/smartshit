import { describe, expect, it } from 'vitest'
import {
  parseCompleteSseEvent,
  parseSseEventPayload,
  serverResponseToChatMessage,
} from './agentClient'

describe('parseSseEventPayload', () => {
  it('parses valid JSON once', () => {
    const event = parseSseEventPayload(JSON.stringify({ type: 'token', content: 'hi' }))
    expect(event).toEqual({ type: 'token', content: 'hi' })
  })

  it('returns null for malformed JSON', () => {
    expect(parseSseEventPayload('{not-json')).toBeNull()
  })
})

describe('parseCompleteSseEvent', () => {
  it('retains provider meta from complete events', () => {
    const event = parseSseEventPayload(JSON.stringify({
      type: 'complete',
      message: 'Sorted column B',
      actions: [],
      source: 'llm',
      meta: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    }))
    expect(event).not.toBeNull()
    const parsed = parseCompleteSseEvent(event!)
    expect(parsed).not.toBeNull()
    expect(parsed!.meta).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    })
  })

  it('returns null for token events', () => {
    expect(parseCompleteSseEvent({ type: 'token', content: 'hi' })).toBeNull()
  })

  it('returns null when message is missing', () => {
    expect(parseCompleteSseEvent({ type: 'complete' })).toBeNull()
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

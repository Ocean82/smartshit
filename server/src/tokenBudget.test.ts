/**
 * Regression tests for the F9 per-send trim guards.
 *
 * F9(1): the chat body is assembled ONCE for the first configured provider's
 * window (up to a 128K Groq window). When the failover chain reaches a
 * smaller-window provider (default order ends at an 8K Ollama), the payload
 * must be re-budgeted so it no longer overflows that provider's context window.
 *
 * F9(2): token estimation (chars / 3.5) is not a serialized-size check. A body
 * whose JSON bytes exceed the configured ceiling must be trimmed below it
 * before send, regardless of token count.
 *
 * Both guards drop lowest-priority context first, then oldest history, and
 * ALWAYS preserve the final user message. They are pure and must not mutate
 * their input.
 */
import { describe, expect, it } from 'vitest'
import {
  checkOverflow,
  trimMessagesForProvider,
  trimMessagesToByteCeiling,
  type ChatMessage,
} from './tokenBudget.js'

/** Build an assembled array shaped like runLlmChat: system, history…, user. */
function assemble(contextChars: number, historyTurns: number, userMsg = 'What is the total?'): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'SPREADSHEET CONTEXT: ' + 'x'.repeat(contextChars) },
  ]
  for (let i = 0; i < historyTurns; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn ${i} ` + 'y'.repeat(400) })
  }
  messages.push({ role: 'user', content: userMsg })
  return messages
}

describe('trimMessagesForProvider (F9(1) — token window guard)', () => {
  it('trims a 128K-sized payload so it no longer overflows an 8K Ollama window', () => {
    // ~40K chars of context ≈ 11.4K tokens — fits Groq (128K) but overflows
    // Ollama's default 8K window. This is the exact failover mismatch F9
    // describes: assembled for Groq, routed to Ollama after failover.
    const msgs = assemble(40_000, 6)
    expect(checkOverflow('groq', msgs)).toBe(0) // sized fine for the first provider
    expect(checkOverflow('ollama', msgs)).toBeGreaterThan(0) // but overflows the fallback

    const trimmed = trimMessagesForProvider('ollama', msgs)

    expect(checkOverflow('ollama', trimmed)).toBe(0) // guard closed the overflow
    expect(trimmed[trimmed.length - 1]).toEqual(msgs[msgs.length - 1]) // final user msg preserved
  })

  it('preserves the final user message even when nothing else can be trimmed', () => {
    // A single enormous user message can't be trimmed away — the guard must
    // stop rather than drop the user's actual request.
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'ctx ' + 'x'.repeat(60_000) },
      { role: 'user', content: 'u '.repeat(30_000) },
    ]
    const trimmed = trimMessagesForProvider('ollama', msgs)
    expect(trimmed[trimmed.length - 1].role).toBe('user')
    expect(trimmed[trimmed.length - 1].content).toBe(msgs[1].content)
  })

  it('is a no-op when the payload already fits the provider window', () => {
    const msgs = assemble(200, 2)
    expect(checkOverflow('ollama', msgs)).toBe(0)
    const trimmed = trimMessagesForProvider('ollama', msgs)
    expect(trimmed).toBe(msgs) // same reference — no needless copy/trim
  })

  it('does not mutate its input', () => {
    const msgs = assemble(40_000, 6)
    const before = JSON.stringify(msgs)
    trimMessagesForProvider('ollama', msgs)
    expect(JSON.stringify(msgs)).toBe(before)
  })
})

describe('trimMessagesToByteCeiling (F9(2) — serialized-byte guard)', () => {
  it('trims a payload exceeding the byte ceiling below it before send', () => {
    const msgs = assemble(5_000, 20) // large serialized body
    const cap = 4_000
    expect(Buffer.byteLength(JSON.stringify(msgs))).toBeGreaterThan(cap)

    const trimmed = trimMessagesToByteCeiling(msgs, cap)

    expect(Buffer.byteLength(JSON.stringify(trimmed))).toBeLessThanOrEqual(cap)
    expect(trimmed[trimmed.length - 1]).toEqual(msgs[msgs.length - 1]) // final user msg preserved
  })

  it('is a no-op when the body is already within the ceiling', () => {
    const msgs = assemble(100, 1)
    const cap = 1_000_000
    const trimmed = trimMessagesToByteCeiling(msgs, cap)
    expect(trimmed).toBe(msgs) // same reference
  })

  it('stops at the final user message when the cap is below everything else', () => {
    // An unreachably small cap still cannot drop the user's request.
    const msgs = assemble(5_000, 10)
    const trimmed = trimMessagesToByteCeiling(msgs, 1)
    expect(trimmed[trimmed.length - 1].role).toBe('user')
    expect(trimmed[trimmed.length - 1].content).toBe(msgs[msgs.length - 1].content)
  })

  it('does not mutate its input', () => {
    const msgs = assemble(5_000, 20)
    const before = JSON.stringify(msgs)
    trimMessagesToByteCeiling(msgs, 4_000)
    expect(JSON.stringify(msgs)).toBe(before)
  })
})

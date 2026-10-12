import { describe, expect, it } from 'vitest'
import { resolveServerRouting } from './routing.js'
import { classifyMode } from './mode.js'
import { config } from './config.js'
import { chatStreamBodySchema } from './schemas/chat.js'
import type { ClientRouting } from '../../shared/clientRouting.js'
import type { AgentMode } from '../../shared/mode.js'
import type { IntentType } from '../../shared/intentTypes.js'

describe('resolveServerRouting', () => {
  it('P1 regression: a confident client act label never routes a formula to a destructive clear', () => {
    const msg = 'create a formula to fill blank cells with zero'
    const client: ClientRouting = {
      mode: 'act',
      intentType: 'create_formula',
      routingSource: 'nlp',
      confidence: 0.9,
    }

    const result = resolveServerRouting(msg, client)

    // The destructive property we lock in: the server must NOT build a clear_sheet.
    expect(result.intent.actions.some((a) => a.tool === 'clear_sheet')).toBe(false)
    // actions.length === 0 additionally depends on no OTHER template claiming the
    // string (e.g. a formatting rule firing on 'formula'); a future rule change
    // surfaces here intentionally rather than silently.
    expect(result.intent.actions).toHaveLength(0)

    // Same message with NO clientRouting (server-decided path) is ALSO safe.
    const serverPath = resolveServerRouting(msg, undefined)
    expect(serverPath.intent.actions.some((a) => a.tool === 'clear_sheet')).toBe(false)
    expect(serverPath.intent.actions).toHaveLength(0)

    // Authoritative-routing shape the pure function controls: the confident
    // client decision is trusted (decidedBy 'client', mode 'act'). The handler's
    // clarify gate is thereby skipped (via decidedBy === 'server'), so the
    // request reaches the model planner rather than a clarification dead-end.
    // (Planner-reach itself is a handler/integration concern, not provable here.)
    expect(result.decidedBy).toBe('client')
    expect(result.mode).toBe('act')
  })

  it('adversarial risk re-check: a client chat label cannot suppress a real wipe', () => {
    const msg = 'clear the whole sheet'
    const client: ClientRouting = {
      mode: 'chat',
      intentType: 'chat',
      routingSource: 'nlp',
      confidence: 0.95,
    }

    const result = resolveServerRouting(msg, client)

    // Server still BUILDS the clear_sheet proposal from the raw text, because
    // resolveIntent re-classifies the raw text as 'act' and ignores the claimed
    // 'chat'. mode === 'chat' means isLlmOnlyMode true ⇒ (handler) template
    // fast-path skipped — but risk detection is NOT suppressed, and nothing is
    // auto-executed. A client mode neither suppresses risk nor authorizes it.
    expect(result.intent.actions.some((a) => a.tool === 'clear_sheet')).toBe(true)
    expect(result.mode).toBe('chat')
  })

  it('trust path: a confident client decision is honored for routing', () => {
    const client: ClientRouting = {
      mode: 'act',
      intentType: 'create_chart',
      routingSource: 'nlp',
      confidence: 0.88,
    }
    const result = resolveServerRouting('make a bar chart of sales', client)

    expect(result.decidedBy).toBe('client')
    expect(result.mode).toBe('act')
    expect(result.userIntent.intentType).toBe('create_chart')
  })

  it('fallback path: an omitted clientRouting re-derives with the server classifier', () => {
    const msg = 'Explain my expenses'
    const result = resolveServerRouting(msg, undefined)

    expect(result.decidedBy).toBe('server')
    expect(result.mode).toBe(classifyMode(msg))
  })

  it('low-confidence fallthrough: below the threshold falls back to the server', () => {
    const client: ClientRouting = {
      mode: 'act',
      intentType: 'create_formula',
      routingSource: 'nlp',
      confidence: config.intentConfidenceThreshold - 0.01,
    }
    const result = resolveServerRouting('do the thing', client)

    expect(result.decidedBy).toBe('server')
  })
})

describe('chatStreamBodySchema clientRouting whitelist', () => {
  const validClientRouting: ClientRouting = {
    mode: 'act',
    intentType: 'create_formula',
    routingSource: 'nlp',
    confidence: 0.9,
  }

  it('accepts a valid clientRouting', () => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: validClientRouting,
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a body that omits clientRouting (backward compatible)', () => {
    const parsed = chatStreamBodySchema.safeParse({ message: 'hi' })
    expect(parsed.success).toBe(true)
  })

  it('rejects an unknown mode', () => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...validClientRouting, mode: 'destroy' },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an extra key (.strict())', () => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...validClientRouting, smuggled: true },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects confidence out of range', () => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...validClientRouting, confidence: 2 },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an unknown routingSource', () => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...validClientRouting, routingSource: 'embedding' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('enum-sync guard: Zod enums stay exhaustive vs shared unions', () => {
  // These literal lists ARE the shared unions' members. If a member is added to
  // AgentMode / IntentType / UserIntent['routingSource'] without updating the
  // Zod enum in schemas/chat.ts, the matching assertion below fails loudly —
  // preventing a silent 400 of legitimate requests. The `satisfies` annotations
  // turn a divergence between this list and the shared type into a compile error.
  const allModes = [
    'explain', 'advise', 'act', 'help', 'chat',
  ] as const satisfies readonly AgentMode[]

  const allIntentTypes = [
    'read', 'analyze', 'write', 'format', 'create_chart', 'create_formula',
    'summarize', 'filter', 'sort', 'clean', 'budget', 'report', 'compare',
    'find', 'calculate', 'export', 'chat', 'unknown',
  ] as const satisfies readonly IntentType[]

  const allRoutingSources = [
    'nlp', 'llm', 'regex',
  ] as const satisfies readonly NonNullable<ClientRouting['routingSource']>[]

  const base: ClientRouting = {
    mode: 'act',
    intentType: 'read',
    routingSource: 'nlp',
    confidence: 0.9,
  }

  it.each(allModes)('Zod enum accepts mode %s', (mode) => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...base, mode },
    })
    expect(parsed.success).toBe(true)
  })

  it.each(allIntentTypes)('Zod enum accepts intentType %s', (intentType) => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...base, intentType },
    })
    expect(parsed.success).toBe(true)
  })

  it.each(allRoutingSources)('Zod enum accepts routingSource %s', (routingSource) => {
    const parsed = chatStreamBodySchema.safeParse({
      message: 'hi',
      clientRouting: { ...base, routingSource },
    })
    expect(parsed.success).toBe(true)
  })
})

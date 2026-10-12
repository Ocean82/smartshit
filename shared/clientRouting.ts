import type { AgentMode } from './mode.js'
import type { IntentType } from './intentTypes.js'

/**
 * The client's authoritative routing decision, serialized onto the chat
 * request. OPTIONAL and UNTRUSTED on the wire: the server validates it with
 * Zod and uses it only for ROUTING (which branch to take), never to authorize
 * a destructive action. BYOK/raw/old callers omit it and get server fallback.
 *
 * `routingSource` is a CLOSED SET owned here. It mirrors
 * `UserIntent['routingSource']` ('nlp' | 'llm' | 'regex'). If a member is ever
 * added, the Zod enum in server/src/schemas/chat.ts AND the enum-sync guard
 * (routing.test.ts, test 7) must be updated in lockstep, or the .strict()
 * schema will silently 400 legitimate requests.
 */
export interface ClientRouting {
  /** Conversational mode the client resolved (explain/advise/act/help/chat). */
  mode: AgentMode
  /** Intent type the client resolved. */
  intentType: IntentType
  /** Which client stage produced the decision — for telemetry/precedence only. */
  routingSource: 'nlp' | 'llm' | 'regex'
  /** Client confidence 0..1. Used ONLY to decide trust-vs-fallthrough, not compared cross-system to server regex scores. */
  confidence: number
}

import type { AgentServerError } from '@/ai/agentClient'

/** True when the server result is the "no request made, visitor is anonymous" marker. */
export function isAnonGated(err: unknown): err is AgentServerError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as AgentServerError).kind === 'server-error' &&
    (err as AgentServerError).code === 'anon-gated'
  )
}

/**
 * Message metadata for the anonymous sign-in reply. `source` stays
 * 'ai-server-refused' on purpose so chatService.isServerRefusal keeps showing
 * the message instead of replacing it with a local fallback.
 */
export function anonGatedMetadata() {
  return {
    toolUsed: 'anon-gated',
    source: 'ai-server-refused',
    signInAction: 'chat',
  } as const
}
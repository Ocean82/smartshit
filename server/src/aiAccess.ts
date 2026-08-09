/**
 * AI access / metering decisions shared by chat and AI-function routes.
 *
 * Root cause of the paywall bypass: treating "BYOK credentials present" as Pro
 * *before* BYOK succeeds, then falling through to server-funded providers.
 *
 * Correct policy:
 * - Pro subscribers: unlimited server inference
 * - Free users under quota: server inference allowed (metered)
 * - Free users over quota with BYOK creds: BYOK-only (no server fallthrough)
 * - Free users over quota without BYOK: denied
 * - Meter only when a server provider actually served the response
 */

export interface AiAccessInput {
  isPro: boolean
  usageAllowed: boolean
  hasByokCredentials: boolean
  dailyLimit: number
}

export interface AiAccessDecision {
  allowed: boolean
  /** When true, BYOK must succeed — do not fall through to app-funded providers. */
  byokOnly: boolean
  denialMessage?: string
}

export function decideAiAccess(input: AiAccessInput): AiAccessDecision {
  if (input.isPro) return { allowed: true, byokOnly: false }
  if (input.usageAllowed) return { allowed: true, byokOnly: false }
  if (input.hasByokCredentials) {
    return { allowed: true, byokOnly: true }
  }
  return {
    allowed: false,
    byokOnly: false,
    denialMessage:
      `You've used all ${input.dailyLimit} free AI questions for today. ` +
      'Upgrade to Pro for unlimited access.',
  }
}

/**
 * Whether this completed call should increment the free-tier counter.
 * BYOK-only successes must not be metered (user pays their own provider).
 */
export function shouldRecordServerUsage(params: {
  usedServerProvider: boolean
  isPro: boolean
}): boolean {
  return params.usedServerProvider && !params.isPro
}

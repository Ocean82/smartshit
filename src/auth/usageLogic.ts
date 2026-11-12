import type { AuthStatus } from '@/lib/serverAccess'

/**
 * Anonymous (signed-out or still pending) usage: no server count exists, so
 * local chat commands stay available and the LLM gate lives in agentClient.
 * Returns null for signed-in/dev, where the normal tracked usage applies.
 */
export function anonymousUsageState(status: AuthStatus, dailyLimit: number) {
  if (status === 'signed-in' || status === 'dev') return null
  return {
    isPro: false as const,
    hasPlanPro: false as boolean | null,
    canAsk: true as const,
    remaining: Infinity,
    dailyLimit,
    usedToday: 0,
    recordUsage: () => {},
    isAnonymous: true as const,
  }
}

/** A locally saved BYOK key must not make an anonymous visitor look unlimited. */
export function computeIsPro(input: {
  status: AuthStatus
  claimsPro: boolean
  serverIsPro: boolean | null
  hasByok: boolean
}): boolean {
  const byokCounts = input.status === 'signed-in' || input.status === 'dev'
  return input.claimsPro || input.serverIsPro === true || (input.hasByok && byokCounts)
}

/** Whether the /api/usage plan fetch should start now. Anonymous never fetches. */
export function shouldFetchPlan(input: {
  status: AuthStatus
  claimsPro: boolean
  hasByok: boolean
  inFlight: boolean
  done: boolean
}): boolean {
  if (input.status !== 'signed-in') return false
  if (input.claimsPro || input.hasByok) return false
  return !input.inFlight && !input.done
}
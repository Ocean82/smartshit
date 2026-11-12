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

/** Outcome of one plan request: discarded, retry the token, or the plan to apply. */
export type PlanOutcome = 'stale' | 'retry' | { isPro: boolean; limit?: number; used?: number }

/**
 * One /api/usage plan request. `isCurrent` is the caller's request-generation
 * check: once the account changes (A -> B -> A included) every await of the old
 * request resolves to 'stale', so its data and errors are never applied.
 * A null or rejected token yields 'retry'; a failed or non-ok fetch is free tier.
 */
export async function runPlanRequest(
  getToken: () => Promise<string | null>,
  fetchUsage: (token: string) => Promise<unknown>,
  isCurrent: () => boolean,
): Promise<PlanOutcome> {
  let token: string | null
  try {
    token = await getToken()
  } catch {
    return isCurrent() ? 'retry' : 'stale'
  }
  if (!isCurrent()) return 'stale'
  if (!token) return 'retry'
  let data: Record<string, unknown> | null
  try {
    data = (await fetchUsage(token)) as Record<string, unknown> | null
  } catch {
    data = null
  }
  if (!isCurrent()) return 'stale'
  if (data?.isPro === true || data?.limit === null || data?.remaining === null) return { isPro: true }
  return {
    isPro: false,
    limit: typeof data?.limit === 'number' ? data.limit : undefined,
    used: typeof data?.used === 'number' ? data.used : undefined,
  }
}

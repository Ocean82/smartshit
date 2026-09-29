import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, useSession } from '@clerk/react'

/** Poll budget after returning from checkout. */
export const UPGRADE_POLL_ATTEMPTS = 10
const UPGRADE_POLL_INTERVAL_MS = 1000

export type SubscriptionStatus = {
  isPro: boolean | null
  revocationReason: string | null
  confirmingUpgrade: boolean
  dismissNotice: () => void
}

/** Pure mapping of a usage response to plan state. `unknown` never raises a notice. */
export function planStatusFrom(data: {
  isPro?: boolean
  revocationReason?: string | null
}): { isPro: boolean; revocationReason: string | null } {
  const pro = data.isPro === true
  const revocationReason =
    pro || !data.revocationReason || data.revocationReason === 'unknown'
      ? null
      : data.revocationReason
  return { isPro: pro, revocationReason }
}

export type PlanCheckResult = {
  ok: boolean
  data?: { isPro?: boolean; revocationReason?: string | null }
}

/** Minimal fetch shape — only `ok` and `json` are used, so tests can stub it. */
export type PlanFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; json(): Promise<unknown> }>

/**
 * One authoritative usage/plan check against the API. Never throws: a missing
 * token, non-2xx, or network failure all read as `{ ok: false }` so the caller
 * leaves state untouched rather than misreading an outage as a revocation.
 */
export async function requestPlanStatus(
  getToken: () => Promise<string | null>,
  fetchImpl: PlanFetch = fetch,
  apiBase: string = import.meta.env.VITE_AI_API_URL ?? '',
): Promise<PlanCheckResult> {
  const token = await getToken()
  if (!token) return { ok: false }
  try {
    const res = await fetchImpl(`${apiBase}/api/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false }
    return { ok: true, data: (await res.json()) as PlanCheckResult['data'] }
  } catch {
    return { ok: false }
  }
}

/**
 * Poll loop that drives the post-checkout confirmation. Runs `check()` on each
 * tick and settles exactly once — when a check passes or the attempt budget is
 * exhausted. Timer handling is owned here so the hook stays a thin wiring layer.
 */
export function createSubscriptionStatusPoller(
  check: () => Promise<boolean>,
  opts: {
    intervalMs?: number
    maxAttempts?: number
  } = {},
): { start: (onSettled: () => void) => void; stop: () => void } {
  const intervalMs = opts.intervalMs ?? UPGRADE_POLL_INTERVAL_MS
  const maxAttempts = opts.maxAttempts ?? UPGRADE_POLL_ATTEMPTS
  let attempts = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let settled = false

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const start = (onSettled: () => void) => {
    timer = setInterval(() => {
      attempts += 1
      void check().then((pro) => {
        if (settled) return
        if (pro || attempts >= maxAttempts) {
          settled = true
          stop()
          onSettled()
        }
      })
    }, intervalMs)
  }

  return { start, stop }
}

/**
 * Authoritative plan state for the current session.
 *
 * Reads from the server rather than Clerk's JWT claims, because the claims in a
 * live session token are a stale snapshot of a webhook that may have landed
 * after the token was issued.
 */
export function useSubscriptionStatus(): SubscriptionStatus {
  const { isSignedIn, getToken } = useAuth()
  const { session } = useSession()
  const [status, setStatus] = useState<{ isPro: boolean | null; revocationReason: string | null }>({
    isPro: null,
    revocationReason: null,
  })
  const [confirmingUpgrade, setConfirmingUpgrade] = useState(false)
  const checkedSession = useRef<string | null>(null)

  const check = useCallback(async (): Promise<boolean> => {
    const { ok, data } = await requestPlanStatus(getToken)
    if (!ok || !data) return false
    setStatus(planStatusFrom(data))
    return data.isPro === true
  }, [getToken])

  useEffect(() => {
    if (!isSignedIn || !session?.id) return
    if (checkedSession.current === session.id) return
    checkedSession.current = session.id

    const afterCheckout =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('upgraded') === 'true'

    if (!afterCheckout) {
      void check()
      return
    }

    // The webhook lands asynchronously, so poll briefly rather than showing the
    // paywall to someone who just paid.
    setConfirmingUpgrade(true)
    const poller = createSubscriptionStatusPoller(check)
    poller.start(() => setConfirmingUpgrade(false))
    return () => poller.stop()
  }, [isSignedIn, session?.id, check])

  const dismissNotice = useCallback(() => {
    setStatus((s) => (s.revocationReason === null ? s : { ...s, revocationReason: null }))
  }, [])

  return {
    isPro: status.isPro,
    revocationReason: status.revocationReason,
    confirmingUpgrade,
    dismissNotice,
  }
}
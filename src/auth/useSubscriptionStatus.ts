import { useCallback, useEffect, useState } from 'react'
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

// ─── Shared session singleton ──────────────────────────────────────────────
// The hook is mounted more than once (ClerkUserSync for the sign-on check, plus
// the chat revocation banner). A per-instance check/poll meant N copies each hit
// POST /api/usage at sign-on and, after checkout, each ran its own 10-tick poll
// (≈2× the sign-on calls and N× the poll traffic). This module-level singleton
// coordinates exactly one check and one poller per session and broadcasts the
// result to every mounted hook — mirroring useUsage's usageSubscribers pattern.

type SharedSnapshot = {
  isPro: boolean | null
  revocationReason: string | null
  confirmingUpgrade: boolean
}

let shared: SharedSnapshot = { isPro: null, revocationReason: null, confirmingUpgrade: false }
const statusSubscribers = new Set<(s: SharedSnapshot) => void>()
let checkedSessionId: string | null = null
let activePoller: { stop: () => void } | null = null

function setShared(next: Partial<SharedSnapshot>): void {
  shared = { ...shared, ...next }
  for (const notify of statusSubscribers) notify(shared)
}

/**
 * Run the authoritative plan check at most once per session, shared across all
 * mounted hook instances. After a checkout redirect (`?upgraded=true`), a single
 * poller waits for the webhook to land. Subsequent callers in the same session
 * are no-ops — they just read the shared snapshot.
 */
export function startSessionCheck(
  sessionId: string,
  getToken: () => Promise<string | null>,
  fetchImpl: PlanFetch = fetch,
): void {
  if (checkedSessionId === sessionId) return
  checkedSessionId = sessionId
  activePoller?.stop()
  activePoller = null

  const check = async (): Promise<boolean> => {
    const { ok, data } = await requestPlanStatus(getToken, fetchImpl)
    if (!ok || !data) return false
    setShared(planStatusFrom(data))
    return data.isPro === true
  }

  const afterCheckout =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('upgraded') === 'true'

  if (!afterCheckout) {
    void check()
    return
  }

  // The webhook lands asynchronously, so poll briefly rather than showing the
  // paywall to someone who just paid.
  setShared({ confirmingUpgrade: true })
  const poller = createSubscriptionStatusPoller(check)
  activePoller = poller
  poller.start(() => {
    activePoller = null
    setShared({ confirmingUpgrade: false })
  })
}

/** Test-only: reset the module singleton between cases. */
export function __resetSubscriptionStatusForTests(): void {
  shared = { isPro: null, revocationReason: null, confirmingUpgrade: false }
  statusSubscribers.clear()
  checkedSessionId = null
  activePoller?.stop()
  activePoller = null
}

/**
 * Authoritative plan state for the current session.
 *
 * Reads from the server rather than Clerk's JWT claims, because the claims in a
 * live session token are a stale snapshot of a webhook that may have landed
 * after the token was issued. All mounted instances share one check/poll via the
 * module singleton above.
 */
export function useSubscriptionStatus(): SubscriptionStatus {
  const { isSignedIn, getToken } = useAuth()
  const { session } = useSession()
  const [snapshot, setSnapshot] = useState<SharedSnapshot>(shared)

  useEffect(() => {
    statusSubscribers.add(setSnapshot)
    setSnapshot(shared) // sync to current shared state on mount
    return () => {
      statusSubscribers.delete(setSnapshot)
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn || !session?.id) return
    startSessionCheck(session.id, getToken)
  }, [isSignedIn, session?.id, getToken])

  const dismissNotice = useCallback(() => {
    if (shared.revocationReason !== null) setShared({ revocationReason: null })
  }, [])

  return {
    isPro: snapshot.isPro,
    revocationReason: snapshot.revocationReason,
    confirmingUpgrade: snapshot.confirmingUpgrade,
    dismissNotice,
  }
}
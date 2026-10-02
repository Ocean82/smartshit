import { useAuth } from '@clerk/react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { loadUserApiKey } from '@/lib/userApiKey'
import { FREE_DAILY_LIMIT } from '../../shared/config'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
const STORAGE_PREFIX = 'smartsht_usage'

interface UsageData {
  count: number
  date: string // YYYY-MM-DD
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Per-account storage key. The counter used to be a single shared key, so two
 * accounts on the same browser inherited each other's count. Keying by account
 * isolates them; the anonymous bucket keeps the old key for continuity.
 */
function storageKey(accountId: string | null): string {
  return accountId ? `${STORAGE_PREFIX}:${accountId}` : STORAGE_PREFIX
}

function getStoredUsage(accountId: string | null): UsageData {
  try {
    const raw = localStorage.getItem(storageKey(accountId))
    if (!raw) return { count: 0, date: getToday() }
    const data = JSON.parse(raw) as UsageData
    if (data.date !== getToday()) {
      return { count: 0, date: getToday() }
    }
    return data
  } catch {
    return { count: 0, date: getToday() }
  }
}

function setStoredUsage(accountId: string | null, data: UsageData): void {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(data))
  } catch {
    // Storage unavailable (private mode / quota) — in-memory state still gates.
  }
}

// ─── Server reconciliation ────────────────────────────────────────────────────
// The local counter is an optimistic guess bumped on every send. It drifts when
// a send doesn't actually bill the server (local fallback, failed request,
// non-LLM source). The server returns the authoritative count after a billable
// turn; `syncServerUsage` writes that truth and notifies the live hook so the
// UI stops drifting. Module-level so the store/SSE path can call it without
// coupling to React.

const usageSubscribers = new Set<(used: number) => void>()

/**
 * Reconcile the local counter to the server's authoritative post-request count.
 *
 * Called from two places: the per-session `/api/usage` fetch (with a known
 * account id, to persist directly) and the chat response path via
 * `reportServerUsage` (which has no account context, so it broadcasts to the
 * live hook — each subscriber knows and persists under its own account key).
 */
export function syncServerUsage(accountId: string | null, used: number): void {
  if (!Number.isFinite(used) || used < 0) return
  setStoredUsage(accountId, { count: Math.floor(used), date: getToday() })
}

/** Broadcast an authoritative count from a context that doesn't know the account. */
export function reportServerUsage(used: number): void {
  if (!Number.isFinite(used) || used < 0) return
  for (const notify of usageSubscribers) notify(Math.floor(used))
}

function subscribeUsage(fn: (used: number) => void): () => void {
  usageSubscribers.add(fn)
  return () => usageSubscribers.delete(fn)
}

/**
 * Core usage tracking logic, extracted to break the circular dependency between
 * useTrackedUsage and the final exported useUsage hook. This is not a hook.
 * `dailyLimit` comes from the server when available so env overrides stay in sync.
 */
function getUsageState(
  isPro: boolean,
  hasByok: boolean,
  isCheckingPro: boolean,
  usage: UsageData,
  dailyLimit: number,
) {
  const canAsk = isPro || isCheckingPro || usage.count < dailyLimit
  const remaining = isPro || isCheckingPro ? Infinity : Math.max(0, dailyLimit - usage.count)
  return { canAsk, remaining }
}

/**
 * The callback to record usage, extracted to break the circular dependency.
 * This is not a hook.
 */
function createRecordUsage(
  isPro: boolean,
  hasByok: boolean,
  accountId: string | null,
  setUsage: (usage: UsageData) => void,
) {
  return () => {
    if (isPro || hasByok) return
    const current = getStoredUsage(accountId)
    const updated: UsageData = { count: current.count + 1, date: getToday() }
    setStoredUsage(accountId, updated)
    setUsage(updated)
  }
}

/** Dev mode hook — unlimited usage, no Clerk dependency */
function useUnlimitedUsage() {
  return {
    isPro: true as const,
    canAsk: true as const,
    remaining: Infinity,
    dailyLimit: FREE_DAILY_LIMIT,
    usedToday: 0,
    recordUsage: () => {},
  }
}

/** Production hook — checks Clerk session metadata for Pro plan */
function useTrackedUsage() {
  const { sessionClaims, getToken } = useAuth()
  const claims = sessionClaims as Record<string, unknown> | undefined
  const accountId = typeof claims?.sub === 'string' ? claims.sub : null

  const [usage, setUsage] = useState<UsageData>(() => getStoredUsage(accountId))
  const [serverIsPro, setServerIsPro] = useState<boolean | null>(null)
  const [serverLimit, setServerLimit] = useState<number | null>(null)
  const fetchedRef = useRef(false)

  // BYOK users bypass limits — they're paying for their own tokens
  const hasByok = Boolean(loadUserApiKey()?.apiKey)

  // Re-read storage when the account changes (login/logout/switch) so one user's
  // count never shows under another, and reconcile when the server reports the
  // authoritative post-request count.
  useEffect(() => {
    setUsage(getStoredUsage(accountId))
    return subscribeUsage((used) => {
      const next: UsageData = { count: used, date: getToday() }
      setStoredUsage(accountId, next)
      setUsage(next)
    })
  }, [accountId])

  // Check plan from Clerk session claims (set via webhook -> Clerk Backend API)
  // Clerk exposes publicMetadata in JWT claims — check multiple possible paths
  const metadata = (
    claims?.metadata ??
    claims?.publicMetadata ??
    (claims?.public_metadata as Record<string, unknown> | undefined)
  ) as Record<string, unknown> | undefined
  const claimsPro = Boolean(
    metadata?.plan === 'pro' ||
    metadata?.stripeSubscriptionId
  )

  // Fetch server-side usage/pro status once per session as authoritative source
  useEffect(() => {
    if (fetchedRef.current || claimsPro || hasByok) return
    fetchedRef.current = true

    const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''
    getToken().then((token) => {
      if (!token) return
      fetch(`${API_BASE}/api/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.isPro === true || data?.limit === null || data?.remaining === null) {
            setServerIsPro(true)
          } else {
            setServerIsPro(false)
            if (typeof data?.limit === 'number') setServerLimit(data.limit)
            // Seed the local counter from the server's authoritative count so the
            // UI starts from truth rather than whatever this browser last guessed.
            // reportServerUsage (not syncServerUsage) so the live hook updates its
            // rendered count too, not just storage.
            if (typeof data?.used === 'number') reportServerUsage(data.used)
          }
        })
        .catch(() => setServerIsPro(false))
    })
  }, [getToken, claimsPro, hasByok, accountId])

  const isPro = claimsPro || serverIsPro === true || hasByok
  const dailyLimit = serverLimit ?? FREE_DAILY_LIMIT

  // While server check is in-flight (serverIsPro === null), don't gate the user.
  // This prevents the flash of "3 questions remaining" before the server responds.
  const isCheckingPro = !claimsPro && !hasByok && serverIsPro === null
  const { canAsk, remaining } = getUsageState(isPro, hasByok, isCheckingPro, usage, dailyLimit)
  const recordUsage = useCallback(
    () => createRecordUsage(isPro, hasByok, accountId, setUsage)(),
    [isPro, hasByok, accountId, setUsage],
  )

  return {
    isPro,
    canAsk,
    remaining,
    dailyLimit,
    usedToday: usage.count,
    recordUsage,
  }
}

/**
 * Usage tracking hook — safe to call with or without Clerk configured.
 * When Clerk is not configured (dev mode), returns unlimited usage.
 */
/*
 * `useUsage` is a wrapper that selects the correct implementation at runtime.
 * The two implementations cannot be merged: `useTrackedUsage` calls Clerk's
 * `useAuth`, which throws when no ClerkProvider is mounted (the dev-mode path),
 * so it must not run at all when Clerk is unconfigured. Selecting the
 * implementation at module scope keeps hook order stable.
 * CLERK_PUBLISHABLE_KEY is a build-time constant, so this check is stable.
 */
export const useUsage = CLERK_PUBLISHABLE_KEY ? useTrackedUsage : useUnlimitedUsage;

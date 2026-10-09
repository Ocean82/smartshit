import { useCallback } from 'react'
import { useAuth } from '@clerk/react'
import { reserveAutoFixLocally, setAutoFixUsed, type AutoFixDecision } from '@/lib/featureGates'
import type { PlanFetch } from './useSubscriptionStatus'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

function isDecision(data: unknown): data is AutoFixDecision {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const isCount = (v: unknown) => v === null || typeof v === 'number'
  return typeof d.allowed === 'boolean' && isCount(d.used) && isCount(d.limit)
}

/**
 * Take one auto-fix slot from the server, which owns the free-tier count. Never
 * throws: no token, non-2xx, a bad body, or a network failure fall back to the
 * local counter so an API outage doesn't block fixing a sheet.
 */
export async function requestAutoFixReservation(
  isPro: boolean,
  getToken: () => Promise<string | null>,
  fetchImpl: PlanFetch = fetch,
  apiBase: string = import.meta.env.VITE_AI_API_URL ?? '',
): Promise<AutoFixDecision> {
  const token = await getToken()
  if (!token) return reserveAutoFixLocally(isPro)
  try {
    const res = await fetchImpl(`${apiBase}/api/autofix/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return reserveAutoFixLocally(isPro)
    const data = await res.json()
    if (!isDecision(data)) return reserveAutoFixLocally(isPro)
    if (data.used !== null) setAutoFixUsed(data.used)
    return data
  } catch {
    return reserveAutoFixLocally(isPro)
  }
}

function useServerAutoFixGate() {
  const { getToken } = useAuth()
  return useCallback((isPro: boolean) => requestAutoFixReservation(isPro, getToken), [getToken])
}

function useLocalAutoFixGate() {
  return useCallback(async (isPro: boolean) => reserveAutoFixLocally(isPro), [])
}

/**
 * Returns `reserve(isPro)`, called before applying an auditor auto-fix. Selected at
 * module scope like `useUsage`: Clerk's `useAuth` throws when no ClerkProvider is mounted.
 */
export const useAutoFixGate = CLERK_PUBLISHABLE_KEY ? useServerAutoFixGate : useLocalAutoFixGate

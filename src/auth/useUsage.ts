import { useAuth } from '@clerk/react'
import { useState, useCallback } from 'react'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
const FREE_DAILY_LIMIT = 3
const STORAGE_KEY = 'smartsht_usage'

interface UsageData {
  count: number
  date: string // YYYY-MM-DD
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getStoredUsage(): UsageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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

function setStoredUsage(data: UsageData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
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
  const { sessionClaims } = useAuth()
  const [usage, setUsage] = useState<UsageData>(getStoredUsage)

  // Check plan from Clerk session claims (set via webhook -> Clerk Backend API)
  const claims = sessionClaims as Record<string, unknown> | undefined
  const metadata = (claims?.metadata ?? claims?.publicMetadata) as Record<string, unknown> | undefined
  const isPro = Boolean(
    metadata?.plan === 'pro' ||
    metadata?.stripeSubscriptionId
  )

  const canAsk = isPro || usage.count < FREE_DAILY_LIMIT
  const remaining = isPro ? Infinity : Math.max(0, FREE_DAILY_LIMIT - usage.count)

  const recordUsage = useCallback(() => {
    if (isPro) return

    const current = getStoredUsage()
    const updated: UsageData = {
      count: current.count + 1,
      date: getToday(),
    }
    setStoredUsage(updated)
    setUsage(updated)
  }, [isPro])

  return {
    isPro,
    canAsk,
    remaining,
    dailyLimit: FREE_DAILY_LIMIT,
    usedToday: usage.count,
    recordUsage,
  }
}

/**
 * Usage tracking hook — safe to call with or without Clerk configured.
 * When Clerk is not configured (dev mode), returns unlimited usage.
 */
export function useUsage() {
  // Hooks must be called unconditionally, but we can branch on which one is "active"
  // Since CLERK_PUBLISHABLE_KEY is a build-time constant, only one path is ever reached.
  if (!CLERK_PUBLISHABLE_KEY) {
    return useUnlimitedUsage()
  }
  return useTrackedUsage()
}

import { useUser } from '@clerk/react'
import { useState, useCallback } from 'react'

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
    // Reset if it's a new day
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

export function useUsage() {
  const { user } = useUser()
  const [usage, setUsage] = useState<UsageData>(getStoredUsage)

  // Check if user has Pro subscription via Clerk metadata
  const isPro = Boolean(
    user?.publicMetadata?.plan === 'pro' ||
    user?.publicMetadata?.stripeSubscriptionId
  )

  const canAsk = isPro || usage.count < FREE_DAILY_LIMIT
  const remaining = isPro ? Infinity : Math.max(0, FREE_DAILY_LIMIT - usage.count)

  const recordUsage = useCallback(() => {
    if (isPro) return // Pro users don't get tracked

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

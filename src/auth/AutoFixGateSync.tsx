import { useEffect } from 'react'
import { setAutoFixReserver } from '@/lib/autoFixReserver'
import { useAutoFixGate } from './useAutoFixGate'
import { useUsage } from './useUsage'

/** Hands the current plan-aware auto-fix reservation to the store's Apply path. */
export function AutoFixGateSync() {
  const reserve = useAutoFixGate()
  const { isPro } = useUsage()
  useEffect(() => {
    setAutoFixReserver(() => reserve(isPro))
    return () => setAutoFixReserver(null)
  }, [reserve, isPro])
  return null
}

import { useAuth } from '@clerk/react'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

interface UpgradePromptProps {
  remaining: number
  dailyLimit: number
}

export function UpgradePrompt({ remaining, dailyLimit }: UpgradePromptProps) {
  // Don't render upgrade prompts in dev mode without Clerk
  if (!CLERK_PUBLISHABLE_KEY) return null

  if (remaining > 0) {
    return (
      <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
        <p className="text-xs text-amber-800">
          <span className="font-semibold">{remaining}/{dailyLimit}</span> free AI questions remaining today
        </p>
      </div>
    )
  }

  return <UpgradeCard />
}

/** Separated so useAuth is only called when Clerk is definitely configured */
function UpgradeCard() {
  const { userId, sessionClaims } = useAuth()
  const email = (sessionClaims as Record<string, unknown>)?.email as string | undefined

  const handleUpgrade = async () => {
    if (!userId) return

    try {
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email: email ?? '' }),
      })

      if (res.ok) {
        const { url } = await res.json()
        if (url) window.location.href = url
      }
    } catch {
      // Silent fail — user can retry
    }
  }

  return (
    <div className="mx-3 mb-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
      <p className="text-sm font-medium text-gray-800 mb-1">
        You've used all your free questions today
      </p>
      <p className="text-xs text-gray-600 mb-3">
        Upgrade to Pro for unlimited AI, all templates, and more.
      </p>
      <button
        onClick={handleUpgrade}
        className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
      >
        Upgrade to Pro — $7/month
      </button>
    </div>
  )
}

export function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-200">
      ✦ PRO
    </span>
  )
}

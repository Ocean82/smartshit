import { useEffect, useRef, useState } from 'react'
import { getAuthStatus, useAuthStatus } from '@/lib/serverAccess'
import { openBillingPortal } from './openBillingPortal'
import { startCheckout, type CheckoutInterval } from './startCheckout'
import { useSubscriptionStatus } from './useSubscriptionStatus'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

const PLANS: { interval: CheckoutInterval; label: string; price: string; note: string }[] = [
  { interval: 'monthly', label: 'Monthly', price: '$7 / month', note: 'Cancel anytime' },
  { interval: 'annual', label: 'Annual', price: '$59 / year', note: 'Save $25 vs monthly' },
]

const ERROR_COPY = {
  checkout: "Couldn't start checkout. Please try again.",
  portal: "Couldn't open billing. Please try again.",
  'no-subscription': 'No subscription found on this account. Try again in a minute, or contact support.',
} as const

/**
 * Header plan control: the always-visible way to pay and to manage what you pay for.
 *
 * - signed-out / free: "Upgrade" with a monthly/annual choice (signed-out visitors are
 *   sent through sign-in by startCheckout).
 * - Pro: "Pro" opens Stripe's billing portal to update a card, see invoices, or cancel.
 * - plan still loading: nothing, so a Pro user never sees an "Upgrade" flash.
 */
export function PlanControl() {
  const status = useAuthStatus()
  if (!CLERK_PUBLISHABLE_KEY || status === 'dev') return null
  if (status === 'signed-in') return <SignedInPlanControl />
  return <UpgradeMenu />
}

function SignedInPlanControl() {
  const { isPro } = useSubscriptionStatus()
  if (isPro === null) return null
  return isPro ? <ManageButton /> : <UpgradeMenu />
}

const buttonBase =
  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:opacity-60'

function UpgradeMenu() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<CheckoutInterval | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = async (interval: CheckoutInterval) => {
    if (busy) return
    setBusy(interval)
    setError(null)
    try {
      const outcome = await startCheckout(interval)
      // 'redirected' navigates away. A signed-out visitor is routed to sign-in and
      // gets 'failed' with no request made; only a signed-in failure is an error.
      if (outcome === 'no-url' || (outcome === 'failed' && getAuthStatus() === 'signed-in')) {
        setError(ERROR_COPY.checkout)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={buttonBase}
        style={{ background: 'var(--accent-600)', color: 'white' }}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="upgrade-button"
      >
        Upgrade
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose a Pro plan"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl p-3 shadow-xl"
          style={{ background: 'var(--surface-elevated)', border: '1px solid var(--neutral-200)', color: 'var(--ink-primary)' }}
        >
          <p className="mb-2 text-xs font-semibold">smartsh!t Pro</p>
          <p className="mb-3 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Unlimited AI, auto-fix, version history and cloud workbooks.
          </p>
          <div className="flex flex-col gap-2">
            {PLANS.map((plan) => (
              <button
                key={plan.interval}
                type="button"
                disabled={busy !== null}
                onClick={() => void choose(plan.interval)}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-blue-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                style={{ border: '1px solid var(--neutral-200)' }}
              >
                <span>
                  <span className="block font-semibold">{plan.label}</span>
                  <span style={{ color: 'var(--ink-muted)' }}>{plan.note}</span>
                </span>
                <span className="font-semibold">{busy === plan.interval ? 'Redirecting…' : plan.price}</span>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--danger, #b91c1c)' }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ManageButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const manage = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const outcome = await openBillingPortal()
      if (outcome === 'failed') setError(ERROR_COPY.portal)
      else if (outcome === 'no-subscription') setError(ERROR_COPY['no-subscription'])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={buttonBase}
        style={{ background: 'var(--neutral-900)', color: 'var(--neutral-300)' }}
        onClick={() => void manage()}
        disabled={busy}
        title="Manage your subscription"
        data-testid="manage-plan-button"
      >
        {busy ? 'Opening…' : '✦ Pro · Manage'}
      </button>
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg p-2 text-xs shadow-xl"
          style={{ background: 'var(--surface-elevated)', color: 'var(--danger, #b91c1c)', border: '1px solid var(--neutral-200)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

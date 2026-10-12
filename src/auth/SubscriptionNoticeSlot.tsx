'use client'

import { useSubscriptionStatus } from './useSubscriptionStatus'
import { SubscriptionNotice, ConfirmingUpgradeNotice } from './SubscriptionNotice'
import { startCheckout } from './startCheckout'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

/**
 * Always-mounted, top-level slot for subscription notices (revocation banner +
 * post-checkout "confirming your upgrade" strip).
 *
 * Mounted once in App.tsx above the main content row so it is visible regardless
 * of which dock/panel is open. It previously lived inside the dockable ChatPanel,
 * where a user with the chat dock closed would never see a revocation banner —
 * the exact failure mode the design called out. The useSubscriptionStatus hook is
 * a shared singleton, so mounting it here does not add a second /api/usage poll.
 *
 * Guarded like UserNav/UpgradePrompt: dev-without-Clerk renders nothing, and the
 * hook is only called once a ClerkProvider is mounted.
 */
export function SubscriptionNoticeSlot() {
  if (!CLERK_PUBLISHABLE_KEY) return null
  return <SubscriptionNoticeSlotInner />
}

function SubscriptionNoticeSlotInner() {
  const { revocationReason, confirmingUpgrade, dismissNotice } = useSubscriptionStatus()

  // Render nothing when there is neither a notice nor a confirmation in flight,
  // so the slot takes no vertical space in the common case.
  if (!revocationReason && !confirmingUpgrade) return null

  return (
    <div className="shrink-0">
      <ConfirmingUpgradeNotice confirming={confirmingUpgrade} />
      <SubscriptionNotice
        reason={revocationReason}
        onResubscribe={startCheckout}
        onDismiss={dismissNotice}
      />
    </div>
  )
}

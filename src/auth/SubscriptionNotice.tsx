'use client'

import { subscriptionNoticeCopy } from './subscriptionNoticeCopy'

/**
 * Explains a revoked subscription instead of silently demoting the user.
 *
 * Renders nothing for `unknown`: that reason means Stripe could not be reached, and
 * a banner implying the user lost their plan because of our own outage would be a
 * lie.
 */
export function SubscriptionNotice({
  reason,
  onResubscribe,
  onDismiss,
}: {
  reason: string | null
  onResubscribe: () => void
  onDismiss: () => void
}) {
  const copy = subscriptionNoticeCopy(reason)
  if (!copy) return null

  return (
    <div
      role="status"
      data-testid="subscription-notice"
      className="mx-3 mb-2"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--surface-raised, #fff)',
        border: '1px solid var(--border-subtle, #e2e2e2)',
        borderRadius: 8,
      }}
    >
      <span style={{ flex: 1, color: 'var(--ink-primary, #1a1a1a)' }}>{copy.message}</span>
      <button
        type="button"
        onClick={onResubscribe}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--accent, #2563eb)',
          fontWeight: 600,
        }}
      >
        {copy.action}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted, #666)' }}
      >
        ×
      </button>
    </div>
  )
}
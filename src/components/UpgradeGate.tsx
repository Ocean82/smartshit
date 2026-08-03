/**
 * UpgradeGate — Reusable upgrade prompt shown when a free user hits a feature gate.
 *
 * Can render as:
 * - Inline banner (default) — fits inside panels and sidebars
 * - Modal overlay — for blocking actions (cloud save, share edit)
 *
 * Each trigger point passes a GatedFeature key; copy comes from featureGates.ts.
 */

import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { X, Sparkles, Lock } from 'lucide-react'
import { getAuthHeaders } from '@/lib/cloudSync'
import type { GatedFeature } from '@/lib/featureGates'
import { FEATURE_GATE_COPY } from '@/lib/featureGates'

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

interface UpgradeGateProps {
  feature: GatedFeature
  /** Show as a full-screen modal overlay (default: inline banner) */
  modal?: boolean
  /** Called when user dismisses the prompt */
  onDismiss?: () => void
  /** Optional override for the headline */
  headline?: string
  /** Optional override for the description */
  description?: string
  /** Optional contextual detail (e.g., "2 more issues found") */
  contextDetail?: string
}

export function UpgradeGate({
  feature,
  modal = false,
  onDismiss,
  headline,
  description,
  contextDetail,
}: UpgradeGateProps) {
  // Don't render upgrade prompts in dev mode without Clerk
  if (!CLERK_PUBLISHABLE_KEY) return null

  const config = FEATURE_GATE_COPY[feature]
  const displayHeadline = headline || config.headline
  const displayDescription = description || config.description

  if (modal) {
    return (
      <UpgradeModal
        headline={displayHeadline}
        description={displayDescription}
        ctaLabel={config.ctaLabel}
        contextDetail={contextDetail}
        onDismiss={onDismiss}
      />
    )
  }

  return (
    <UpgradeInline
      headline={displayHeadline}
      description={displayDescription}
      ctaLabel={config.ctaLabel}
      contextDetail={contextDetail}
      onDismiss={onDismiss}
    />
  )
}

// ─── Inline Banner ───────────────────────────────────────────────────────────

function UpgradeInline({
  headline,
  description,
  ctaLabel,
  contextDetail,
  onDismiss,
}: {
  headline: string
  description: string
  ctaLabel: string
  contextDetail?: string
  onDismiss?: () => void
}) {
  const [loading, setLoading] = useState(false)

  return (
    <div className="mx-3 mb-3 px-4 py-4 rounded-xl border relative" style={{ background: 'var(--accent-50)', borderColor: 'var(--accent-200)' }}>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 rounded-md transition-colors"
          style={{ color: 'var(--neutral-400)' }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      )}
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 p-1.5 rounded-lg" style={{ background: 'var(--accent-100)' }}>
          <Lock size={16} style={{ color: 'var(--accent-600)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink-primary)' }}>
            {headline}
          </p>
          <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--ink-secondary)' }}>
            {description}
          </p>
          {contextDetail && (
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--accent-700)' }}>
              {contextDetail}
            </p>
          )}
          <UpgradeButton label={ctaLabel} loading={loading} setLoading={setLoading} />
        </div>
      </div>
    </div>
  )
}

// ─── Modal Overlay ───────────────────────────────────────────────────────────

function UpgradeModal({
  headline,
  description,
  ctaLabel,
  contextDetail,
  onDismiss,
}: {
  headline: string
  description: string
  ctaLabel: string
  contextDetail?: string
  onDismiss?: () => void
}) {
  const [loading, setLoading] = useState(false)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'oklch(0.1 0.02 250 / 0.5)', backdropFilter: 'blur(3px)' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-6 relative"
        style={{ background: 'var(--surface-panel)', boxShadow: '0 24px 48px oklch(0.1 0 0 / 0.18), 0 4px 12px oklch(0.1 0 0 / 0.08)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-gate-title"
      >
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--neutral-400)' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        )}

        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--accent-100)' }}>
            <Sparkles size={24} style={{ color: 'var(--accent-600)' }} />
          </div>

          <h3 id="upgrade-gate-title" className="text-base font-bold mb-2" style={{ color: 'var(--ink-primary)' }}>
            {headline}
          </h3>

          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ink-secondary)' }}>
            {description}
          </p>

          {contextDetail && (
            <p className="text-xs font-medium mb-4 px-3 py-1.5 rounded-lg" style={{ background: 'var(--accent-50)', color: 'var(--accent-700)' }}>
              {contextDetail}
            </p>
          )}

          <UpgradeButton label={ctaLabel} loading={loading} setLoading={setLoading} fullWidth />

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 text-xs transition-colors"
              style={{ color: 'var(--ink-muted)' }}
            >
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared Upgrade Button ───────────────────────────────────────────────────

function UpgradeButton({
  label,
  loading,
  setLoading,
  fullWidth = false,
}: {
  label: string
  loading: boolean
  setLoading: (v: boolean) => void
  fullWidth?: boolean
}) {
  const { isSignedIn } = useAuth()

  const handleUpgrade = async () => {
    if (!isSignedIn || loading) return
    setLoading(true)

    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: '' }),
      })

      if (res.ok) {
        const { url } = await res.json()
        if (url) window.location.href = url
      }
    } catch {
      // Silent fail — user can retry
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleUpgrade}
      disabled={loading || !isSignedIn}
      className={`py-2.5 px-5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-50 ${fullWidth ? 'w-full' : ''}`}
      style={{ background: 'var(--accent-600)' }}
    >
      {loading ? 'Redirecting…' : label}
    </button>
  )
}

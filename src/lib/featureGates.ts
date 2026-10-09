/**
 * Feature Gates — Single source of truth for free vs Pro feature limits.
 *
 * Every gated feature checks here. When limits change, update one file.
 * The server mirrors these values via env vars (FREE_DAILY_LIMIT, etc.)
 * so client and server stay aligned.
 */

import {
  FREE_DAILY_LIMIT,
  FREE_CLOUD_WORKBOOK_LIMIT as SHARED_CLOUD_LIMIT,
  FREE_AUTOFIX_LIFETIME_LIMIT as SHARED_AUTOFIX_LIMIT,
} from '../../shared/config'

// ─── Limits ──────────────────────────────────────────────────────────────────

/** AI chat questions per day for free users */
export const FREE_DAILY_CHAT_LIMIT = FREE_DAILY_LIMIT

/** Lifetime auto-fix uses before gate (free users get a taste); the server enforces it */
export const FREE_AUTOFIX_LIFETIME_LIMIT = SHARED_AUTOFIX_LIMIT

/** Maximum cloud workbooks for free users */
export const FREE_CLOUD_WORKBOOK_LIMIT = SHARED_CLOUD_LIMIT

// ─── Feature Flags ───────────────────────────────────────────────────────────

export type GatedFeature =
  | 'ai-chat'
  | 'auto-fix'
  | 'cloud-save'
  | 'version-history'
  | 'share-edit'

export interface FeatureGateConfig {
  feature: GatedFeature
  headline: string
  description: string
  ctaLabel: string
}

/** Upgrade prompt copy for each gated feature */
export const FEATURE_GATE_COPY: Record<GatedFeature, FeatureGateConfig> = {
  'ai-chat': {
    feature: 'ai-chat',
    headline: "You're getting great use out of the AI",
    description: `You've asked ${FREE_DAILY_CHAT_LIMIT} questions today — that's the free daily limit. Upgrade to Pro for unlimited AI chat so you never hit a wall mid-workflow.`,
    ctaLabel: 'Upgrade to Pro — $7/month',
  },
  'auto-fix': {
    feature: 'auto-fix',
    headline: 'The Auditor found more to fix',
    description: "You've used your free auto-fixes and there are still issues to resolve. Upgrade to fix everything instantly with one click — no manual editing needed.",
    ctaLabel: 'Upgrade to fix everything',
  },
  'cloud-save': {
    feature: 'cloud-save',
    headline: 'Save more to the cloud',
    description: `Free accounts include ${FREE_CLOUD_WORKBOOK_LIMIT} cloud workbook${FREE_CLOUD_WORKBOOK_LIMIT === 1 ? '' : 's'}. Upgrade to Pro for unlimited cloud storage, automatic backups, and access from any device.`,
    ctaLabel: 'Upgrade for unlimited cloud',
  },
  'version-history': {
    feature: 'version-history',
    headline: 'Version history is a Pro feature',
    description: 'Roll back to any previous version of your workbook. Never lose work again — every save creates a restore point.',
    ctaLabel: 'Upgrade for version history',
  },
  'share-edit': {
    feature: 'share-edit',
    headline: 'Collaborative editing is coming soon',
    description:
      'Today every share link is view-only for all plans. Editable collaboration is not shipping yet — ' +
      'upgrade for unlimited AI, cloud workbooks, and version history in the meantime.',
    ctaLabel: 'See Pro benefits',
  },
}

// ─── Local Storage Keys ──────────────────────────────────────────────────────

export const AUTOFIX_USAGE_KEY = 'smartsht_autofix_used'

/** Get lifetime auto-fix usage from localStorage (a cache of the server count) */
export function getAutoFixUsed(): number {
  try {
    const val = localStorage.getItem(AUTOFIX_USAGE_KEY)
    return val ? parseInt(val, 10) || 0 : 0
  } catch {
    return 0
  }
}

/** Store the server's authoritative auto-fix count */
export function setAutoFixUsed(used: number): void {
  try {
    localStorage.setItem(AUTOFIX_USAGE_KEY, String(used))
  } catch {
    // Storage unavailable
  }
}

export interface AutoFixDecision {
  allowed: boolean
  /** null = unlimited */
  used: number | null
  limit: number | null
}

/** Local-only reservation: dev mode (no auth) and the fallback when the server can't be reached. */
export function reserveAutoFixLocally(isPro: boolean): AutoFixDecision {
  if (isPro) return { allowed: true, used: null, limit: null }
  const used = getAutoFixUsed()
  if (used >= FREE_AUTOFIX_LIFETIME_LIMIT) {
    return { allowed: false, used, limit: FREE_AUTOFIX_LIFETIME_LIMIT }
  }
  setAutoFixUsed(used + 1)
  return { allowed: true, used: used + 1, limit: FREE_AUTOFIX_LIFETIME_LIMIT }
}

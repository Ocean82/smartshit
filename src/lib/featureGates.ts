/**
 * Feature Gates — Single source of truth for free vs Pro feature limits.
 *
 * Every gated feature checks here. When limits change, update one file.
 * The server mirrors these values via env vars (FREE_DAILY_LIMIT, etc.)
 * so client and server stay aligned.
 */

// ─── Limits ──────────────────────────────────────────────────────────────────

/** AI chat questions per day for free users */
export const FREE_DAILY_CHAT_LIMIT = 7

/** Lifetime auto-fix uses before gate (free users get a taste) */
export const FREE_AUTOFIX_LIFETIME_LIMIT = 3

/** Maximum cloud workbooks for free users */
export const FREE_CLOUD_WORKBOOK_LIMIT = 1

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
    description: "You've asked 7 questions today — that's the free daily limit. Upgrade to Pro for unlimited AI chat so you never hit a wall mid-workflow.",
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
    description: 'Free accounts include 1 cloud workbook. Upgrade to Pro for unlimited cloud storage, automatic backups, and access from any device.',
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

/** Get lifetime auto-fix usage from localStorage */
export function getAutoFixUsed(): number {
  try {
    const val = localStorage.getItem(AUTOFIX_USAGE_KEY)
    return val ? parseInt(val, 10) || 0 : 0
  } catch {
    return 0
  }
}

/** Record an auto-fix use */
export function recordAutoFixUse(): void {
  try {
    const current = getAutoFixUsed()
    localStorage.setItem(AUTOFIX_USAGE_KEY, String(current + 1))
  } catch {
    // Storage unavailable
  }
}

/** Check if user can auto-fix (Pro or under limit) */
export function canAutoFix(isPro: boolean): boolean {
  if (isPro) return true
  return getAutoFixUsed() < FREE_AUTOFIX_LIFETIME_LIMIT
}

/** Get remaining auto-fix uses */
export function autoFixRemaining(isPro: boolean): number {
  if (isPro) return Infinity
  return Math.max(0, FREE_AUTOFIX_LIFETIME_LIMIT - getAutoFixUsed())
}

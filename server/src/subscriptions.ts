/**
 * Subscription entitlement resolution.
 *
 * Clerk's publicMetadata is the single source of plan state. This module owns the
 * only two paths that write it: the Stripe webhook and the reconciler. Nothing here
 * is called on the request path — plan reads go through plan.ts and the 5-minute
 * cache there.
 *
 * Policy: `past_due` retains pro because Stripe may still retry the payment. Only a
 * definite non-paying status revokes.
 */

/** Statuses that entitle the user to Pro. */
const PRO_STATUSES = new Set(['active', 'trialing', 'past_due'])

export type SubscriptionReason =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'no_subscription'
  | 'lapsed'
  | 'unknown'

export type VerificationResult = {
  isPro: boolean
  reason: SubscriptionReason
  status: string | null
  subscriptionId: string | null
}

/**
 * Map a Stripe subscription status to a plan.
 *
 * Unknown and future statuses resolve to `free` rather than throwing, so a Stripe
 * API addition cannot silently grant access.
 */
export function mapStatusToPlan(status: string | undefined | null): 'free' | 'pro' {
  if (!status) return 'free'
  return PRO_STATUSES.has(status) ? 'pro' : 'free'
}

/** Status class used to order competing subscriptions. Lower wins. */
function statusRank(status: string | undefined | null): number {
  if (status === 'active' || status === 'trialing') return 0
  if (status === 'past_due') return 1
  return 2
}

/**
 * Choose which of a user's subscriptions decides their plan.
 *
 * Ranking is by status class first, then newest-first within a class: an `active`
 * subscription outranks a `past_due` one even when the `past_due` is newer, because
 * `past_due` is a weaker claim. A lingering canceled subscription next to a live one
 * therefore cannot revoke access, and a brand-new canceled subscription next to an
 * older one still wins its own class by recency.
 */
export function pickSubscription<T extends { status?: string | null; created?: number | null }>(
  subs: T[],
): T | null {
  if (subs.length === 0) return null
  const ordered = [...subs].sort(
    (a, b) => statusRank(a.status) - statusRank(b.status) || (b.created ?? 0) - (a.created ?? 0),
  )
  return ordered[0]
}

/** Reason describing a status, for display. */
export function reasonForStatus(status: string | undefined | null): SubscriptionReason {
  if (status === 'active' || status === 'trialing' || status === 'past_due') return status
  return 'lapsed'
}

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

/** Minimal shape of a Stripe subscription this module needs. */
export type StripeSubList = {
  id: string
  status?: string | null
  created?: number | null
}

/**
 * Extract a Clerk user id from a Stripe payload.
 *
 * Checkout Sessions carry `client_reference_id`; subscription objects carry
 * `metadata.userId`, which createCheckoutSession sets via
 * `subscription_data[metadata][userId]`. Both are absent for subscriptions created
 * outside Checkout, which is why an email fallback exists.
 *
 * Every candidate is type-checked and trimmed before it is returned. A dashboard-created
 * Checkout Session can carry `client_reference_id: ' '`, and returning that would send
 * `updateUserMetadata(' ')`, which Clerk rejects — turning a paid checkout into a 400
 * that Stripe retries until it gives up, with nothing in the logs but a bad id.
 */
export function resolveUserIdFromPayload(obj: Record<string, unknown>): string | null {
  const ref = obj.client_reference_id
  if (typeof ref === 'string' && ref.trim()) return ref.trim()
  const metadata = obj.metadata as Record<string, unknown> | undefined
  const fromMeta = metadata?.userId
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim()
  return null
}

/**
 * Resolve a Clerk user id by email, for subscriptions that carry no metadata.
 *
 * The lookup is injected so this stays unit-testable without a Clerk client. It is
 * called with exactly one argument — the trimmed, lowercased address — because Clerk's
 * email filter is a plain equality match, and it must only ever be passed an address
 * that identifies the user in question (in practice, the email on the Stripe customer
 * record, which is whatever a human typed at checkout).
 *
 * **Propagates whatever the lookup throws.** "Clerk was unreachable" must not be
 * flattened into "no such user", which would read as a negative answer and could strand
 * a paying customer. A caller that wants to tolerate the failure must rethrow or return
 * a 5xx so the event is retried — never swallow it and answer 200. A blank email is the
 * one case answered here, and it never reaches the lookup.
 */
export async function resolveUserIdByEmail(
  email: string,
  lookup: (email: string) => Promise<string | null>,
): Promise<string | null> {
  if (!email || !email.trim()) return null
  return lookup(email.trim().toLowerCase())
}

export type PlanWriterDeps = {
  updatePublicMetadata(
    userId: string,
    plan: 'free' | 'pro',
    subscriptionId: string | null,
    revocationReason: string | null,
  ): Promise<void>
  invalidateCache(userId: string): void
}

/**
 * The reason to persist alongside a plan write, or null for none.
 *
 * A banner is only correct for a user who *had* Pro and no longer does, so a user who
 * was always free records nothing — they have not been revoked, and alarming them about
 * a plan they never had is worse than saying nothing. `unknown` is also silent, because
 * it means Stripe was unreachable and nothing was actually learned.
 *
 * `no_subscription` is deliberately NOT silent. A stored `pro` with no subscription
 * found means the subscription genuinely went away, so that user is being demoted and
 * deserves to be told why. Never-Pro users reach here too and record nothing, via the
 * `currentPlan` check below.
 *
 * Callers depend on `isPro: false` implying a real lapse reason: `verifySubscriptionForUser`
 * derives both from the same Stripe status, so an `isPro: false` result never carries
 * reason `active`. That coupling is what keeps a pro-flavoured string out of the
 * revocation slot.
 */
export function revocationReasonFor(
  result: VerificationResult,
  currentPlan: 'free' | 'pro',
): string | null {
  if (result.isPro) return null
  if (result.reason === 'unknown') return null
  if (currentPlan !== 'pro') return null
  return result.status ?? 'lapsed'
}

/**
 * The only place plan state is written.
 *
 * An `unknown` result means Stripe could not be reached, so the previously known
 * value stands. Writing here would revoke access because of a network blip, which is
 * the one outcome this whole design exists to prevent. The `isPro` value is deliberately
 * not consulted: a result that says "unknown" but claims Pro is still unknown, and
 * trusting it would write an unverified grant.
 *
 * Throws if the Clerk write fails, so a caller can retry rather than record a purchase
 * that was never persisted. The cache is invalidated only after a successful write, so a
 * failure leaves the cached entry matching what is actually stored in Clerk.
 */
export async function writeClerkPlan(
  userId: string,
  result: VerificationResult,
  currentPlan: 'free' | 'pro',
  deps: PlanWriterDeps,
): Promise<boolean> {
  if (result.reason === 'unknown') return false
  const plan = result.isPro ? 'pro' : 'free'
  // planFromPublicMetadata grants pro whenever stripeSubscriptionId is set, so a
  // demotion must clear it or the very next read re-grants Pro and the write is
  // a no-op in practice.
  const subscriptionId = result.isPro ? result.subscriptionId : null
  await deps.updatePublicMetadata(
    userId,
    plan,
    subscriptionId,
    revocationReasonFor(result, currentPlan),
  )
  deps.invalidateCache(userId)
  return true
}

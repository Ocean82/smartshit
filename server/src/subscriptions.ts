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

export type VerifyDeps = {
  retrieveSubscription(id: string): Promise<StripeSubList & { cancel_at_period_end?: boolean }>
  listSubscriptionsByEmail(email: string): Promise<StripeSubList[]>
}

/**
 * True for a Stripe "no such resource" 404 — a definite answer, not an outage.
 *
 * Matched on `statusCode === 404` because the installed SDK exposes the HTTP status as
 * `err.statusCode` for these errors (there is no `err.status` in stripe@17). `code ===
 * 'resource_missing'` is a second marker but a strict subset of the 404s, so it is not
 * consulted: a proxy/CDN 404 with an HTML body surfaces as a `StripeAPIError` with no
 * statusCode, which this correctly reads as an outage.
 *
 * This assumes the Stripe secret key is live and points at the right account. With a
 * test-mode key in production (or a wrong account), *every* retrieve 404s, so every
 * user resolves to `no_subscription` — a mass demotion the reconciler would happily
 * perform. Key wiring in index.ts must fail startup rather than run half-configured.
 *
 * Exported because the webhook needs the same distinction: a 404 on a deleted customer
 * is a no-op, while any other error must propagate so Stripe retries.
 */
export function isMissingResource(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const status = (err as { statusCode?: unknown }).statusCode
  return status === 404
}

/**
 * Determine a user's real subscription state.
 *
 * Never throws for a well-formed user. A Stripe failure returns `reason: 'unknown'`
 * with `isPro: false`, which writeClerkPlan refuses to persist — so the caller's
 * stored state survives an outage untouched.
 *
 * A 404 on the stored id is *not* an outage: the subscription genuinely no longer
 * exists. That is a definite "not paying" answer, so it falls through to the email
 * lookup to find a resubscription under a new id, and reports `no_subscription` if
 * there is none. Conflating a 404 with a timeout would either strand a lapsed Pro
 * user or fail open on a real revocation.
 *
 * The email lookup also runs when the stored id resolves to a real but dead
 * subscription, not only on a 404. A missed cancellation webhook leaves a canceled
 * `sub_1` in Clerk while the user resubscribed as `sub_2`; trusting the stored id
 * alone would demote a paying customer, which is the one outcome the reconciler
 * exists to prevent. A live subscription found by email wins.
 *
 * Preferring the best of several subscriptions by email is a deliberate bias toward
 * granting: because email is identity here (any live sub on the address is a probative
 * claim) and a wrong grant self-heals on the next reconcile while a wrong revoke does
 * not, resolving ties in the user's favour is the safe error direction.
 */
export async function verifySubscriptionForUser(
  user: { id: string; email: string | null; subscriptionId: string | null },
  deps: VerifyDeps,
): Promise<VerificationResult> {
  let sub: StripeSubList | null = null

  if (user.subscriptionId) {
    try {
      sub = await deps.retrieveSubscription(user.subscriptionId)
    } catch (err) {
      // Definite deletion: keep looking by email rather than reporting unknown.
      if (!isMissingResource(err)) {
        return { isPro: false, reason: 'unknown', status: null, subscriptionId: null }
      }
    }
  }

  if (user.email && mapStatusToPlan(sub?.status) !== 'pro') {
    let byEmail: StripeSubList | null
    try {
      byEmail = pickSubscription(await deps.listSubscriptionsByEmail(user.email))
    } catch {
      // Reached only when no Pro answer is already in hand, so an email outage leaves
      // us unable to tell whether a resubscription was missed. Report unknown and
      // write nothing; the next reconcile retries.
      return { isPro: false, reason: 'unknown', status: null, subscriptionId: null }
    }
    if (byEmail && mapStatusToPlan(byEmail.status) === 'pro') sub = byEmail
  }

  if (!sub) {
    return { isPro: false, reason: 'no_subscription', status: null, subscriptionId: null }
  }

  return {
    isPro: mapStatusToPlan(sub.status) === 'pro',
    reason: reasonForStatus(sub.status),
    status: typeof sub.status === 'string' ? sub.status : null,
    subscriptionId: sub.id,
  }
}

export type ReconcileUser = {
  id: string
  email: string | null
  plan: 'free' | 'pro'
  subscriptionId: string | null
}

export type ReconcileDeps = {
  listUsers(): AsyncIterable<ReconcileUser>
  verify(user: ReconcileUser): Promise<VerificationResult>
  write(userId: string, result: VerificationResult, currentPlan: 'free' | 'pro'): Promise<boolean>
}

/**
 * Full reconciliation across every user, free and Pro alike.
 *
 * Sweeping all users rather than only known-Pro ones is what heals a subscription
 * whose webhook was missed entirely: the user never got Pro, so a downgrade-only
 * sweep would never look at them.
 *
 * A write happens only on a real difference in stored state — the plan, or the
 * subscription id. Tracking the id too means a user who resubscribed under a new id
 * has their record corrected even though they were Pro the whole time; comparing the
 * plan alone would leave the stale id in place. Change-only writes are what keep a
 * sweep of every user from becoming a write to every user, so a boot or daily run
 * does not hammer Clerk's API.
 *
 * The summary's `unknown` counts every user whose verified state could not be
 * established or persisted: a throwing `verify` (Stripe/Clerk outage), a
 * `reason: 'unknown'` result, or a `write` that throws or returns `false`. It does
 * not cover a `listUsers` failure — see below.
 *
 * Per-user failures never abort the sweep; every later user is still visited. The
 * one thing that does abort it is `listUsers` itself throwing mid-iteration — the
 * online read path is down, not one user's verification — and that rejects with an
 * Error whose message carries the partial counts, so the scheduler's log both shows
 * the failure and says how many users were done before it.
 */
export async function reconcileAllUsers(
  deps: ReconcileDeps,
): Promise<{ verified: number; changed: number; unknown: number }> {
  const summary = { verified: 0, changed: 0, unknown: 0 }

  try {
    for await (const user of deps.listUsers()) {
      let result: VerificationResult
      try {
        result = await deps.verify(user)
      } catch {
        summary.verified += 1
        summary.unknown += 1
        continue
      }

      summary.verified += 1
      if (result.reason === 'unknown') {
        // writeClerkPlan would refuse this anyway; this guard keeps the accounting
        // straight (a refused write is counted as unknown, not as changed).
        summary.unknown += 1
        continue
      }

      const wasPro = user.plan === 'pro'
      const shouldBePro = result.isPro
      // A Pro plan implies a stored subscription id, so only a Pro→Pro comparison can
      // meaningfully differ on the id.
      const idChanged =
        wasPro === shouldBePro &&
        (shouldBePro ? (user.subscriptionId ?? null) !== result.subscriptionId : false)
      if (shouldBePro === wasPro && !idChanged) continue

      try {
        const wrote = await deps.write(user.id, result, user.plan)
        if (wrote) summary.changed += 1
        else {
          // The verified fact could not be persisted. Count it as unknown so the
          // cycle reports the truth, and keep going — aborting here would leave
          // every remaining user unverified until the next run.
          summary.unknown += 1
        }
      } catch {
        // Mirror of the false-return case above.
        summary.unknown += 1
      }
    }
  } catch (err) {
    throw new Error(
      `reconcile aborted mid-sweep (listUsers failed) after verifying ${summary.verified}, changing ${summary.changed}, unknown ${summary.unknown}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    )
  }

  return summary
}

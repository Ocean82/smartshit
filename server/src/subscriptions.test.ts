/**
 * Pure policy tests for subscription status mapping and selection.
 * These functions carry the entire entitlement policy, so every branch is pinned.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  mapStatusToPlan,
  pickSubscription,
  resolveUserIdFromPayload,
  resolveUserIdByEmail,
  revocationReasonFor,
  verifySubscriptionForUser,
  isMissingResource,
  writeClerkPlan,
} from './subscriptions.js'

describe('mapStatusToPlan', () => {
  it('grants pro for active', () => {
    expect(mapStatusToPlan('active')).toBe('pro')
  })

  it('grants pro for trialing', () => {
    expect(mapStatusToPlan('trialing')).toBe('pro')
  })

  it('grants pro for past_due so Stripe dunning can retry', () => {
    expect(mapStatusToPlan('past_due')).toBe('pro')
  })

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'])(
    'revokes pro for %s',
    (status) => {
      expect(mapStatusToPlan(status)).toBe('free')
    },
  )

  it.each([undefined, null, '', 'something_new_from_stripe'])(
    'revokes pro for unknown status %s',
    (status) => {
      expect(mapStatusToPlan(status)).toBe('free')
    },
  )
})

describe('pickSubscription', () => {
  // status is optional because Stripe may omit it, which is what
  // statusRank(undefined) has to cope with.
  const sub = (id: string, status: string | undefined, created: number) => ({ id, status, created })

  it('returns null for an empty list', () => {
    expect(pickSubscription([])).toBeNull()
  })

  it('prefers active over past_due even when past_due is newer', () => {
    const chosen = pickSubscription([
      sub('a', 'past_due', 200),
      sub('b', 'active', 100),
    ])
    expect(chosen?.id).toBe('b')
  })

  it('prefers trialing over past_due', () => {
    const chosen = pickSubscription([
      sub('a', 'past_due', 200),
      sub('b', 'trialing', 100),
    ])
    expect(chosen?.id).toBe('b')
  })

  it('falls back to the newest when nothing is pro-eligible', () => {
    const chosen = pickSubscription([
      sub('a', 'canceled', 100),
      sub('b', 'unpaid', 200),
    ])
    expect(chosen?.id).toBe('b')
  })

  it('breaks ties within a class by newest first', () => {
    const chosen = pickSubscription([
      sub('a', 'active', 100),
      sub('b', 'active', 300),
    ])
    expect(chosen?.id).toBe('b')
  })

  it('prefers active over a brand-new canceled subscription', () => {
    const chosen = pickSubscription([
      sub('a', 'canceled', 500),
      sub('b', 'active', 100),
    ])
    expect(chosen?.id).toBe('b')
  })

  it('treats a missing status as the weakest class', () => {
    const chosen = pickSubscription([
      sub('a', undefined, 500),
      sub('b', 'unpaid', 100),
    ])
    expect(chosen?.id).toBe('a')
  })

  it('prefers a real timestamp over a null created', () => {
    const chosen = pickSubscription([
      { id: 'nullish', status: 'active', created: null },
      { id: 'dated', status: 'active', created: 100 },
    ])
    expect(chosen?.id).toBe('dated')
  })

  it('still prefers a higher status class when both created values are null', () => {
    const chosen = pickSubscription([
      { id: 'canceled', status: 'canceled', created: null },
      { id: 'active', status: 'active', created: null },
    ])
    expect(chosen?.id).toBe('active')
  })

  it('is stable across calls when rank and created are identical', () => {
    // Stripe's list ordering is not guaranteed, so a full tie could arrive in either
    // order between runs. Both subs map to the same plan, so the winner may differ —
    // what must not differ is the entitlement. Pin that both orders agree on plan.
    const orders = [
      [sub('a', 'canceled', 100), sub('b', 'canceled', 100)],
      [sub('b', 'canceled', 100), sub('a', 'canceled', 100)],
    ]
    const plans = orders.map(
      (list) => mapStatusToPlan(pickSubscription(list)?.status),
    )
    expect(plans[0]).toBe('free')
    expect(plans[1]).toBe('free')
  })

  it('does not mutate the caller array', () => {
    const input = [sub('a', 'past_due', 200), sub('b', 'active', 100)]
    const snapshot = [...input]
    pickSubscription(input)
    expect(input).toEqual(snapshot)
  })
})

describe('resolveUserIdFromPayload', () => {
  it('reads client_reference_id from a Checkout Session', () => {
    const obj = { client_reference_id: 'user_123', metadata: { userId: 'user_other' } }
    expect(resolveUserIdFromPayload(obj)).toBe('user_123')
  })

  it('falls back to metadata.userId when client_reference_id is absent', () => {
    expect(resolveUserIdFromPayload({ metadata: { userId: 'user_456' } })).toBe('user_456')
  })

  it('returns null for a payload with no identity', () => {
    expect(resolveUserIdFromPayload({ metadata: {} })).toBeNull()
  })

  it('ignores an empty client_reference_id', () => {
    expect(resolveUserIdFromPayload({ client_reference_id: '', metadata: { userId: 'user_7' } })).toBe('user_7')
  })

  it('ignores a whitespace-only client_reference_id', () => {
    // A dashboard-created Checkout Session can carry this. Returning it would send
    // updateUserMetadata(' ') and turn a paid checkout into a 400 Stripe retries forever.
    expect(resolveUserIdFromPayload({ client_reference_id: '   ' })).toBeNull()
    expect(resolveUserIdFromPayload({ client_reference_id: '  ', metadata: { userId: 'user_7' } })).toBe('user_7')
  })

  it('trims the returned id rather than returning it padded', () => {
    expect(resolveUserIdFromPayload({ client_reference_id: '  user_123  ' })).toBe('user_123')
    expect(resolveUserIdFromPayload({ metadata: { userId: '  user_456  ' } })).toBe('user_456')
  })

  it('rejects a non-string id, so a number or object cannot become a Clerk id', () => {
    expect(resolveUserIdFromPayload({ client_reference_id: 12345 })).toBeNull()
    expect(resolveUserIdFromPayload({ metadata: { userId: 12345 } })).toBeNull()
    expect(resolveUserIdFromPayload({ metadata: { userId: { id: 'user_x' } } })).toBeNull()
    expect(resolveUserIdFromPayload({ client_reference_id: 0, metadata: { userId: false } })).toBeNull()
  })

  it('rejects a whitespace-only metadata userId', () => {
    expect(resolveUserIdFromPayload({ metadata: { userId: '  ' } })).toBeNull()
  })

  it('tolerates a missing or non-object metadata', () => {
    expect(resolveUserIdFromPayload({ metadata: null })).toBeNull()
    expect(resolveUserIdFromPayload({ metadata: 'user_str' })).toBeNull()
    expect(resolveUserIdFromPayload({ metadata: [] })).toBeNull()
  })
})

describe('resolveUserIdByEmail', () => {
  it('returns the id the lookup resolves', async () => {
    const lookup = async (email: string) => (email === 'a@b.com' ? 'user_9' : null)
    await expect(resolveUserIdByEmail('a@b.com', lookup)).resolves.toBe('user_9')
  })

  it('returns null when the email matches no user', async () => {
    const lookup = async () => null
    await expect(resolveUserIdByEmail('nobody@nowhere.com', lookup)).resolves.toBeNull()
  })

  it('calls the lookup with exactly one argument', async () => {
    // Guards against a future caller smuggling extra context into the lookup.
    const seen: unknown[][] = []
    const lookup = async (...args: unknown[]) => {
      seen.push(args)
      return 'user_9'
    }
    await expect(resolveUserIdByEmail('a@b.com', lookup as (email: string) => Promise<string | null>)).resolves.toBe('user_9')
    expect(seen).toEqual([['a@b.com']])
  })

  it('propagates a lookup failure instead of reporting no such user', async () => {
    // A Clerk outage must never read as a negative answer: Task 8 relies on this
    // propagating so it can 5xx and let Stripe retry, rather than claiming the
    // event and stranding a paying customer until the daily reconcile.
    const lookup = async () => {
      throw new Error('Clerk 500')
    }
    await expect(resolveUserIdByEmail('a@b.com', lookup)).rejects.toThrow('Clerk 500')
  })

  it('does not call a throwing lookup for a blank email', async () => {
    const lookup = async () => {
      throw new Error('must not be called')
    }
    await expect(resolveUserIdByEmail('   ', lookup)).resolves.toBeNull()
  })

  it('does not call the lookup for a blank email', async () => {
    let called = false
    const lookup = async () => {
      called = true
      return 'user_x'
    }
    await expect(resolveUserIdByEmail('', lookup)).resolves.toBeNull()
    expect(called).toBe(false)
  })

  it('trims and lowercases before the lookup, since Clerk matches on equality', async () => {
    // Load-bearing: Stripe stores whatever case the customer typed, and the webhook
    // feeds that address straight in. Without normalization the lookup silently
    // misses and a paying customer never gets Pro.
    const seen: string[] = []
    const lookup = async (email: string) => {
      seen.push(email)
      return 'user_9'
    }
    await expect(resolveUserIdByEmail('  Owner@Example.COM  ', lookup)).resolves.toBe('user_9')
    expect(seen).toEqual(['owner@example.com'])
  })

  it('treats a whitespace-only email as blank', async () => {
    let called = false
    const lookup = async () => {
      called = true
      return 'user_x'
    }
    await expect(resolveUserIdByEmail('   ', lookup)).resolves.toBeNull()
    expect(called).toBe(false)
  })
})

describe('revocationReasonFor', () => {
  it('is null when the result is pro', () => {
    const result = { isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_1' } as const
    expect(revocationReasonFor(result, 'free')).toBeNull()
    expect(revocationReasonFor(result, 'pro')).toBeNull()
  })

  it('records the stripe status when a pro user is demoted', () => {
    const result = { isPro: false, reason: 'lapsed', status: 'canceled', subscriptionId: 'sub_1' } as const
    expect(revocationReasonFor(result, 'pro')).toBe('canceled')
  })

  it('falls back to lapsed when the status is missing', () => {
    const result = { isPro: false, reason: 'lapsed', status: null, subscriptionId: 'sub_1' } as const
    expect(revocationReasonFor(result, 'pro')).toBe('lapsed')
  })

  it('is null for a user who was already free, so no banner is shown', () => {
    const result = { isPro: false, reason: 'lapsed', status: 'canceled', subscriptionId: null } as const
    expect(revocationReasonFor(result, 'free')).toBeNull()
  })

  it('is null when there is no subscription at all', () => {
    const result = { isPro: false, reason: 'no_subscription', status: null, subscriptionId: null } as const
    expect(revocationReasonFor(result, 'free')).toBeNull()
  })

  it('still records a reason when a pro user subscription has vanished entirely', () => {
    // Silent demotion is the failure mode worth avoiding: a stored pro whose
    // subscription no longer exists in Stripe has lost access, and gets no
    // explanation unless the reconciler records why.
    const result = { isPro: false, reason: 'no_subscription', status: null, subscriptionId: null } as const
    expect(revocationReasonFor(result, 'pro')).toBe('lapsed')
  })
})

describe('writeClerkPlan', () => {
  const makeDeps = () => {
    const updatePublicMetadata = vi.fn(async () => {})
    const invalidateCache = vi.fn()
    return { updatePublicMetadata, invalidateCache, deps: { updatePublicMetadata, invalidateCache } }
  }

  it('writes pro, clears any revocation reason, and invalidates the cache', async () => {
    const { updatePublicMetadata, invalidateCache, deps } = makeDeps()
    const wrote = await writeClerkPlan(
      'user_1',
      { isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_1' },
      'free',
      deps,
    )
    expect(wrote).toBe(true)
    expect(updatePublicMetadata).toHaveBeenCalledWith('user_1', 'pro', 'sub_1', null)
    expect(invalidateCache).toHaveBeenCalledWith('user_1')
  })

  it('refuses to write when the reason is unknown', async () => {
    const { updatePublicMetadata, invalidateCache, deps } = makeDeps()
    const wrote = await writeClerkPlan(
      'user_1',
      { isPro: false, reason: 'unknown', status: null, subscriptionId: null },
      'pro',
      deps,
    )
    expect(wrote).toBe(false)
    expect(updatePublicMetadata).not.toHaveBeenCalled()
    expect(invalidateCache).not.toHaveBeenCalled()
  })

  it('refuses to write an unknown result that claims pro', async () => {
    // An `unknown` reason means nothing was learned, whatever `isPro` claims. Honouring
    // the claim would grant paid access on the strength of a failed lookup.
    const { updatePublicMetadata, invalidateCache, deps } = makeDeps()
    const wrote = await writeClerkPlan(
      'user_1b',
      { isPro: true, reason: 'unknown', status: null, subscriptionId: 'sub_1b' },
      'free',
      deps,
    )
    expect(wrote).toBe(false)
    expect(updatePublicMetadata).not.toHaveBeenCalled()
    expect(invalidateCache).not.toHaveBeenCalled()
  })

  it('records no reason for a free user who is demoted from nothing', async () => {
    // Pins that the writer actually passes its `currentPlan` through. Hardcoding 'pro'
    // at the call site instead would banner every free user the reconciler sweeps.
    const { updatePublicMetadata, deps } = makeDeps()
    await writeClerkPlan(
      'user_1c',
      { isPro: false, reason: 'lapsed', status: 'canceled', subscriptionId: 'sub_1c' },
      'free',
      deps,
    )
    expect(updatePublicMetadata).toHaveBeenCalledWith('user_1c', 'free', null, null)
  })

  it('writes free, records why, and clears the subscription id when a pro user is demoted', async () => {
    const { updatePublicMetadata, invalidateCache, deps } = makeDeps()
    await writeClerkPlan(
      'user_2',
      { isPro: false, reason: 'lapsed', status: 'unpaid', subscriptionId: 'sub_2' },
      'pro',
      deps,
    )
    // subscriptionId MUST be null here. planFromPublicMetadata grants pro when
    // stripeSubscriptionId is set, so persisting it alongside plan 'free' would
    // silently re-grant Pro on the next read — see Task 3a.
    expect(updatePublicMetadata).toHaveBeenCalledWith('user_2', 'free', null, 'unpaid')
    // The cache must be dropped on the demotion path too, not just on promotion:
    // the cached entry is 5 minutes of live Pro for a customer who just got revoked.
    expect(invalidateCache).toHaveBeenCalledWith('user_2')
  })

  it('never leaves a subscription id on a free plan', async () => {
    const { updatePublicMetadata, deps } = makeDeps()
    await writeClerkPlan(
      'user_3',
      { isPro: false, reason: 'lapsed', status: 'canceled', subscriptionId: 'sub_9' },
      'pro',
      deps,
    )
    const [, plan, subscriptionId] = updatePublicMetadata.mock.calls[0] as unknown as [
      string,
      string,
      string | null,
      string | null,
    ]
    expect(plan).toBe('free')
    expect(subscriptionId).toBeNull()
  })

  it('keeps the subscription id on a pro plan, so the rule is not applied twice', async () => {
    // The mirror of the demotion rule. A blanket "null the id" would strip pro of its
    // only cross-check and make a later revocation undetectable.
    const { updatePublicMetadata, deps } = makeDeps()
    await writeClerkPlan(
      'user_4',
      { isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_4' },
      'pro',
      deps,
    )
    expect(updatePublicMetadata).toHaveBeenCalledWith('user_4', 'pro', 'sub_4', null)
  })

  it('propagates a write failure instead of reporting a write that never happened', async () => {
    // Task 8 depends on this. The webhook route answers 200 once the event is claimed,
    // so a swallowed Clerk error would discard a purchase with no retry and no log.
    const updatePublicMetadata = vi.fn(async () => {
      throw new Error('Clerk 500')
    })
    const invalidateCache = vi.fn()
    const deps = { updatePublicMetadata, invalidateCache }
    await expect(
      writeClerkPlan(
        'user_5',
        { isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_5' },
        'free',
        deps,
      ),
    ).rejects.toThrow('Clerk 500')
    // The cache holds the value that was never persisted, so invalidating it would
    // only serve a stale read on the next request.
    expect(invalidateCache).not.toHaveBeenCalled()
  })
})

describe('verifySubscriptionForUser', () => {
  const user = { id: 'user_1', email: 'owner@example.com', subscriptionId: 'sub_1' }

  it('returns pro for a live subscription', async () => {
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'active', created: 10 }),
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_1' })
  })

  it('returns free with reason lapsed for a canceled subscription', async () => {
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'canceled', created: 10 }),
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result.isPro).toBe(false)
    expect(result.reason).toBe('lapsed')
  })

  it('falls back to email when no subscription id is stored', async () => {
    const deps = {
      retrieveSubscription: async () => {
        throw new Error('should not be called')
      },
      listSubscriptionsByEmail: async () => [{ id: 'sub_email', status: 'active', created: 5 }],
    }
    const result = await verifySubscriptionForUser({ ...user, subscriptionId: null }, deps)
    expect(result).toEqual({ isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_email' })
  })

  it('falls back to email when the stored subscription id no longer exists', async () => {
    const deps = {
      retrieveSubscription: async () => {
        throw Object.assign(new Error('No such subscription'), { statusCode: 404 })
      },
      listSubscriptionsByEmail: async () => [{ id: 'sub_resub', status: 'active', created: 90 }],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_resub' })
  })

  it('returns no_subscription when the id is gone and email finds nothing', async () => {
    const deps = {
      retrieveSubscription: async () => {
        throw Object.assign(new Error('No such subscription'), { statusCode: 404 })
      },
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: false, reason: 'no_subscription', status: null, subscriptionId: null })
  })

  it('returns no_subscription when neither id nor email finds anything', async () => {
    const deps = {
      retrieveSubscription: async () => {
        throw new Error('not called')
      },
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser({ ...user, subscriptionId: null }, deps)
    expect(result).toEqual({ isPro: false, reason: 'no_subscription', status: null, subscriptionId: null })
  })

  it('returns unknown, never false, when Stripe throws a non-404 error', async () => {
    const deps = {
      retrieveSubscription: async () => {
        throw new Error('Stripe timeout')
      },
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: false, reason: 'unknown', status: null, subscriptionId: null })
  })

  it.each([500, 429])(
    'returns unknown, never false, when Stripe fails with status %i',
    async (statusCode) => {
      // A real Stripe outage arrives as a statusCode, not a bare Error. Only a 404 is a
      // definite answer, so anything else must fail open rather than demote a payer.
      const deps = {
        retrieveSubscription: async () => {
          throw Object.assign(new Error('Stripe API error'), { statusCode })
        },
        listSubscriptionsByEmail: async () => [],
      }
      const result = await verifySubscriptionForUser(user, deps)
      expect(result).toEqual({ isPro: false, reason: 'unknown', status: null, subscriptionId: null })
    },
  )

  it('treats a past_due subscription as still pro', async () => {
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'past_due', created: 10 }),
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: true, reason: 'past_due', status: 'past_due', subscriptionId: 'sub_1' })
  })

  it('keeps pro for an active subscription flagged cancel_at_period_end', async () => {
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'active', created: 10, cancel_at_period_end: true }),
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result.isPro).toBe(true)
  })

  it('prefers a live resubscription when the stored id is dead but present', async () => {
    // The missed-cancellation-webhook case. Clerk still holds canceled sub_1 while the
    // user resubscribed as sub_2. Trusting the stored id alone demotes a paying
    // customer — precisely the failure the reconciler exists to prevent.
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'canceled', created: 10 }),
      listSubscriptionsByEmail: async () => [{ id: 'sub_2', status: 'active', created: 90 }],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_2' })
  })

  it('does not consult email when the stored subscription is already pro', async () => {
    // Saves a Stripe call on the common path, and pins that the fallback cannot
    // downgrade a confirmed live subscription.
    const listSubscriptionsByEmail = vi.fn(async () => [
      { id: 'sub_other', status: 'canceled', created: 999 },
    ])
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'active', created: 10 }),
      listSubscriptionsByEmail,
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result.subscriptionId).toBe('sub_1')
    expect(listSubscriptionsByEmail).not.toHaveBeenCalled()
  })

  it('returns unknown when the email fallback throws, since a resubscription may be missed', async () => {
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'canceled', created: 10 }),
      listSubscriptionsByEmail: async () => {
        throw new Error('Stripe list timeout')
      },
    }
    const result = await verifySubscriptionForUser(user, deps)
    // Not 'lapsed': without the email lookup we cannot rule out a live sub_2, and
    // a wrong demotion is far worse than a delayed one.
    expect(result).toEqual({ isPro: false, reason: 'unknown', status: null, subscriptionId: null })
  })

  it('reports no_subscription for a 404 when the user has no email to search by', async () => {
    const listSubscriptionsByEmail = vi.fn(async () => [])
    const deps = {
      retrieveSubscription: async () => {
        throw Object.assign(new Error('No such subscription'), { statusCode: 404 })
      },
      listSubscriptionsByEmail,
    }
    const result = await verifySubscriptionForUser({ ...user, email: null }, deps)
    expect(result).toEqual({ isPro: false, reason: 'no_subscription', status: null, subscriptionId: null })
    expect(listSubscriptionsByEmail).not.toHaveBeenCalled()
  })

  it('keeps the stored subscription when email finds only dead ones too', async () => {
    // A dead email result must never overwrite a real direct answer, or a lapsed
    // customer's revocation would be recorded against an unrelated id.
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_1', status: 'canceled', created: 10 }),
      listSubscriptionsByEmail: async () => [{ id: 'sub_old', status: 'unpaid', created: 5 }],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: false, reason: 'lapsed', status: 'canceled', subscriptionId: 'sub_1' })
  })

  it('reports no_subscription when a 404 turns up only dead subscriptions by email', async () => {
    // The other side of the same rule: a canceled sub in the email list is not a
    // substitute for a live one, so a long-gone subscriber is definitely not paying.
    const deps = {
      retrieveSubscription: async () => {
        throw Object.assign(new Error('No such subscription'), { statusCode: 404 })
      },
      listSubscriptionsByEmail: async () => [{ id: 'sub_old', status: 'canceled', created: 5 }],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: false, reason: 'no_subscription', status: null, subscriptionId: null })
  })

  it('picks the best of several email subscriptions, newest-first', async () => {
    // Stripe's list endpoint returns newest-first, so [0] is a freshly canceled sub
    // while an older yearly sub is still paying. Taking list[0] or sorting by date
    // alone would demote a paying customer whose other subscription survives.
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_canceled', status: 'canceled', created: 900 }),
      listSubscriptionsByEmail: async () => [
        { id: 'sub_canceled_new', status: 'canceled', created: 900 },
        { id: 'sub_live', status: 'active', created: 100 },
      ],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: true, reason: 'active', status: 'active', subscriptionId: 'sub_live' })
  })

  it('prefers a live over a past_due subscription regardless of recency', async () => {
    // plan-change overlap: a new monthly sub lapsed while an older one is still in
    // its grace period. Status class must outweigh recency or the live month is lost.
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_unpaid', status: 'unpaid', created: 900 }),
      listSubscriptionsByEmail: async () => [
        { id: 'sub_unpaid_new', status: 'unpaid', created: 900 },
        { id: 'sub_past_due', status: 'past_due', created: 100 },
      ],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: true, reason: 'past_due', status: 'past_due', subscriptionId: 'sub_past_due' })
  })

  it('normalizes a missing status to null rather than leaking undefined', async () => {
    // The result type says `status: string | null`, and the revocation banner keys on
    // it. A statusless sub must not smuggle `undefined` out of the type boundary.
    const deps = {
      retrieveSubscription: async () => ({ id: 'sub_nostatus' }),
      listSubscriptionsByEmail: async () => [],
    }
    const result = await verifySubscriptionForUser(user, deps)
    expect(result).toEqual({ isPro: false, reason: 'lapsed', status: null, subscriptionId: 'sub_nostatus' })
  })
})

describe('isMissingResource', () => {
  it('is true only for a 404, since only that is a definite answer', () => {
    expect(isMissingResource({ statusCode: 404 })).toBe(true)
    expect(isMissingResource({ statusCode: 500 })).toBe(false)
    expect(isMissingResource({ statusCode: 429 })).toBe(false)
    expect(isMissingResource({})).toBe(false)
  })

  it('matches the real stripe@17 error shape, on statusCode and not on its siblings', () => {
    // The installed SDK exposes the HTTP status as `err.statusCode` and the subtype as
    // `err.code === 'resource_missing'`; `err.status` does not exist. The resolver is
    // used by the webhook too, so this contract is shared: code alone and status alone
    // must each read as an outage, not a missing resource.
    expect(isMissingResource({ statusCode: 404, code: 'resource_missing' })).toBe(true)
    expect(isMissingResource({ code: 'resource_missing' })).toBe(false)
    expect(isMissingResource({ status: 404 })).toBe(false)
    expect(isMissingResource({ statusCode: '404' })).toBe(false)
  })

  it('is false for a thrown non-object, rather than throwing', () => {
    expect(isMissingResource(null)).toBe(false)
    expect(isMissingResource(undefined)).toBe(false)
    expect(isMissingResource('404')).toBe(false)
    expect(isMissingResource(new Error('boom'))).toBe(false)
  })
})

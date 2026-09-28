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
    expect(revocationReasonFor(result, 'pro')).toBeNull()
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

  it('writes free, records why, and clears the subscription id when a pro user is demoted', async () => {
    const { updatePublicMetadata, deps } = makeDeps()
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

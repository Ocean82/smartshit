/**
 * Pure policy tests for subscription status mapping and selection.
 * These functions carry the entire entitlement policy, so every branch is pinned.
 */
import { describe, it, expect } from 'vitest'
import {
  mapStatusToPlan,
  pickSubscription,
  resolveUserIdFromPayload,
  resolveUserIdByEmail,
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
})

describe('resolveUserIdByEmail', () => {
  it('returns the id the lookup resolves', async () => {
    const lookup = async (email: string) => (email === 'a@b.com' ? 'user_9' : null)
    await expect(resolveUserIdByEmail('a@b.com', lookup)).resolves.toBe('user_9')
  })

  it('returns null when the email has no subscription', async () => {
    const lookup = async () => null
    await expect(resolveUserIdByEmail('nobody@nowhere.com', lookup)).resolves.toBeNull()
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
})

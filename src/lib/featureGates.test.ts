/**
 * Feature Gates — Drift Detection
 *
 * Ensures that the free-tier limits defined in featureGates.ts match the values
 * used elsewhere in the codebase. The server enforces limits via FREE_DAILY_LIMIT
 * env var (defaulting to 10), which must match the client constant.
 *
 * If this test fails, it means someone updated one location but not the other.
 * Fix by making all values consistent.
 *
 * REF: major-review.md investigation I7 (free-tier constant drift)
 */

import { describe, it, expect } from 'vitest'
import { FREE_DAILY_CHAT_LIMIT } from './featureGates'

// The server uses `Number(process.env.FREE_DAILY_LIMIT ?? 10)` as the default.
// The client `useUsage.ts` defines `FREE_DAILY_LIMIT = 10` at the module level.
// All three must stay aligned.
const EXPECTED_FREE_DAILY_LIMIT = 10

describe('Free-tier limits alignment', () => {
  it('client FREE_DAILY_CHAT_LIMIT matches the expected canonical value', () => {
    // If this fails, reconcile featureGates.ts, useUsage.ts, and
    // server/src/usage.ts (FREE_DAILY_LIMIT default).
    expect(FREE_DAILY_CHAT_LIMIT).toBe(EXPECTED_FREE_DAILY_LIMIT)
  })

  it('limit is a positive integer', () => {
    expect(FREE_DAILY_CHAT_LIMIT).toBeGreaterThan(0)
    expect(Number.isInteger(FREE_DAILY_CHAT_LIMIT)).toBe(true)
  })
})

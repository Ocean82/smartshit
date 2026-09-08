import { describe, expect, it } from 'vitest'
import { INTENT_PHRASES } from './intentPhrases.js'
import type { IntentType } from './intentTypes'

/**
 * Compile-fails if IntentType grows a member that INTENT_PHRASES does not
 * cover. `unknown` is the empty fallback class; every other intent needs at
 * least one reference phrase for MiniLM classification.
 */
const INTENT_COVERAGE: Record<IntentType, 'phrases' | 'empty'> = {
  read: 'phrases',
  analyze: 'phrases',
  write: 'phrases',
  format: 'phrases',
  create_chart: 'phrases',
  create_formula: 'phrases',
  summarize: 'phrases',
  filter: 'phrases',
  sort: 'phrases',
  clean: 'phrases',
  budget: 'phrases',
  report: 'phrases',
  compare: 'phrases',
  find: 'phrases',
  calculate: 'phrases',
  export: 'phrases',
  chat: 'phrases',
  unknown: 'empty',
}

describe('INTENT_PHRASES', () => {
  it('covers every IntentType declared in intentTypes.ts', () => {
    const expected = Object.keys(INTENT_COVERAGE).sort()
    expect(Object.keys(INTENT_PHRASES).sort()).toEqual(expected)

    for (const [intent, kind] of Object.entries(INTENT_COVERAGE) as [IntentType, 'phrases' | 'empty'][]) {
      const phrases = INTENT_PHRASES[intent]
      expect(phrases, `${intent} missing from INTENT_PHRASES`).toBeDefined()
      if (kind === 'empty') {
        expect(phrases).toEqual([])
      } else {
        expect(phrases.length, `${intent} needs at least one reference phrase`).toBeGreaterThan(0)
      }
    }
  })
})

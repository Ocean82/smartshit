import { describe, expect, it } from 'vitest'
import { decideSignInAction, normalizeReason, shouldCloseSignIn } from './signInState'

describe('decideSignInAction', () => {
  it('opens the dialog for anonymous and pending', () => {
    expect(decideSignInAction('anonymous', 'chat')).toBe('open-dialog')
    expect(decideSignInAction('pending', 'upgrade')).toBe('open-dialog')
  })
  it('continues into checkout for a signed-in upgrade click, otherwise no-op', () => {
    expect(decideSignInAction('signed-in', 'upgrade')).toBe('continue')
    expect(decideSignInAction('signed-in', 'cloud')).toBe('noop')
  })
  it('is a no-op in dev (no auth)', () => {
    expect(decideSignInAction('dev', 'header')).toBe('noop')
  })
})

describe('shouldCloseSignIn', () => {
  it('closes only when open and signed in', () => {
    expect(shouldCloseSignIn('signed-in', true)).toBe(true)
    expect(shouldCloseSignIn('anonymous', true)).toBe(false)
    expect(shouldCloseSignIn('signed-in', false)).toBe(false)
  })
})

describe('normalizeReason', () => {
  it('falls back to header for unknown values', () => {
    expect(normalizeReason('nope')).toBe('header')
    expect(normalizeReason('share')).toBe('share')
  })
})

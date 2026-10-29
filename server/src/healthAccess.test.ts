import { describe, it, expect } from 'vitest'
import { shouldShowHealthDiagnostics } from './healthAccess.js'

describe('shouldShowHealthDiagnostics', () => {
  it('allows authenticated operators from any peer', () => {
    expect(
      shouldShowHealthDiagnostics({
        peer: '203.0.113.7',
        forwardedFor: '203.0.113.7',
        authenticated: true,
      }),
    ).toBe(true)
  })

  it('allows direct loopback deploy curl (no X-Forwarded-For)', () => {
    expect(
      shouldShowHealthDiagnostics({
        peer: '127.0.0.1',
        forwardedFor: undefined,
        authenticated: false,
      }),
    ).toBe(true)
  })

  it('denies nginx-proxied public traffic even when peer is loopback', () => {
    expect(
      shouldShowHealthDiagnostics({
        peer: '127.0.0.1',
        forwardedFor: '203.0.113.7',
        authenticated: false,
      }),
    ).toBe(false)
  })

  it('denies anonymous non-loopback peers', () => {
    expect(
      shouldShowHealthDiagnostics({
        peer: '203.0.113.7',
        forwardedFor: undefined,
        authenticated: false,
      }),
    ).toBe(false)
  })
})

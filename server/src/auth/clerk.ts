import type { Request, Response, NextFunction } from 'express'
import { getAuth } from '@clerk/express'
import { createClerkClient } from '@clerk/backend'
import { config } from '../config.js'
import { recordAuthDenial } from './authMetrics.js'

export type Plan = 'free' | 'pro'

export type ClerkHealth = {
  ok: boolean
  /** Config-only (strict deploy gate) vs live Backend API probe. */
  mode: 'config' | 'live'
  latencyMs?: number
  publishableKeyConfigured: boolean
  authorizedPartyCount: number
  error?: string
}

export function planFromPublicMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Plan {
  if (!metadata) return 'free'
  if (metadata.plan === 'pro' || metadata.stripeSubscriptionId) return 'pro'
  return 'free'
}

export function getClerkClient() {
  if (!config.clerkSecretKey) {
    throw new Error('CLERK_SECRET_KEY not configured (SmartSht instance required)')
  }
  return createClerkClient({ secretKey: config.clerkSecretKey })
}

/**
 * Options for `@clerk/express` `clerkMiddleware`.
 * Pass keys from config so VITE_CLERK_PUBLISHABLE_KEY fallback is honored,
 * and set authorizedParties so www/apex JWT `azp` values are accepted.
 */
export function getClerkMiddlewareOptions() {
  const options: {
    secretKey?: string
    publishableKey?: string
    authorizedParties: string[]
  } = {
    authorizedParties: config.clerkAuthorizedParties,
  }
  if (config.clerkSecretKey) options.secretKey = config.clerkSecretKey
  if (config.clerkPublishableKey) options.publishableKey = config.clerkPublishableKey
  return options
}

/** Config-only Clerk readiness — used by `/health?strict=1` so deploys do not flake on Clerk blips. */
export function clerkConfigHealth(): ClerkHealth {
  const publishableKeyConfigured = Boolean(config.clerkPublishableKey)
  const authorizedPartyCount = config.clerkAuthorizedParties.length
  if (!config.clerkSecretKey) {
    return {
      ok: false,
      mode: 'config',
      publishableKeyConfigured,
      authorizedPartyCount,
      error: 'CLERK_SECRET_KEY not configured',
    }
  }
  return {
    ok: true,
    mode: 'config',
    publishableKeyConfigured,
    authorizedPartyCount,
  }
}

/**
 * Live Backend API probe for authenticated `/health`. Confirms the secret key
 * can reach Clerk — not used in the strict deploy gate (that stays config-only).
 */
export async function clerkLiveHealthCheck(): Promise<ClerkHealth> {
  const base = clerkConfigHealth()
  if (!base.ok) return base

  const start = Date.now()
  try {
    await getClerkClient().users.getUserList({ limit: 1 })
    return {
      ...base,
      mode: 'live',
      ok: true,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Clerk Backend API unreachable'
    console.error(`[clerk] health probe failed: ${message}`)
    return {
      ...base,
      mode: 'live',
      ok: false,
      latencyMs: Date.now() - start,
      error: message,
    }
  }
}

/** True when Clerk attached a session user id to this request. */
export function hasClerkUserId(auth: { userId?: string | null }): boolean {
  return Boolean(auth.userId)
}

function hasBearerAuthorization(req: Request): boolean {
  const header = req.headers.authorization
  return typeof header === 'string' && /^Bearer\s+\S+/i.test(header)
}

/** Express middleware: 401 unless Clerk session JWT is valid. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req)
  // Gate on userId only. `isAuthenticated` is undefined on some Clerk Express
  // auth objects, and `!undefined` would 401 every authenticated request.
  if (!hasClerkUserId(auth)) {
    // Bearer present but no session → expired/invalid JWT or azp mismatch.
    recordAuthDenial(req.path || req.url || 'unknown', hasBearerAuthorization(req) ? 'no_session' : 'no_bearer')
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  next()
}

export function getRequestUserId(req: Request): string | null {
  const auth = getAuth(req)
  return auth.userId ?? null
}

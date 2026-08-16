import type { Request, Response, NextFunction } from 'express'
import { getAuth } from '@clerk/express'
import { createClerkClient } from '@clerk/backend'
import { config } from '../config.js'

export type Plan = 'free' | 'pro'

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

/** True when Clerk attached a session user id to this request. */
export function hasClerkUserId(auth: { userId?: string | null }): boolean {
  return Boolean(auth.userId)
}

/** Express middleware: 401 unless Clerk session JWT is valid. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req)
  // Gate on userId only. `isAuthenticated` is undefined on some Clerk Express
  // auth objects, and `!undefined` would 401 every authenticated request.
  if (!hasClerkUserId(auth)) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  next()
}

export function getRequestUserId(req: Request): string | null {
  const auth = getAuth(req)
  return auth.userId ?? null
}

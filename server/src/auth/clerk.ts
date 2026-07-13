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

/** Express middleware: 401 unless Clerk session JWT is valid. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req)
  if (!auth.isAuthenticated || !auth.userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  next()
}

export function getRequestUserId(req: Request): string | null {
  const auth = getAuth(req)
  return auth.userId ?? null
}

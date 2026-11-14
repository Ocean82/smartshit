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

type Middleware = (req: Request, res: Response, next: NextFunction) => void

const BASE64URL = /^[A-Za-z0-9_-]*$/

/** Decode a base64url JWT segment as JSON; null if it is not valid base64url JSON. */
function decodeJwtJsonPart(part: string): unknown {
  if (!part || !BASE64URL.test(part)) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * True when the request has a bearer token shaped like a JWT (three dot-separated
 * parts, which is what Clerk tries to decode) whose header, payload or signature
 * cannot be decoded. A token Clerk can decode is never "undecodable".
 */
export function isUndecodableBearer(req: Request): boolean {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')
  if (!match) return false
  const parts = match[1].split('.')
  if (parts.length !== 3) return false
  const [header, payload, signature] = parts
  const decodes = (p: string) => {
    const v = decodeJwtJsonPart(p)
    return v !== null && typeof v === 'object'
  }
  return !(decodes(header) && decodes(payload) && signature.length > 0 && BASE64URL.test(signature))
}

/**
 * Wrap Clerk's middleware so a bearer token that cannot be decoded is a 401,
 * not a 500. @clerk/express passes a SyntaxError from base64/JWT decoding to
 * next(err) for tokens like `a.b.c`, which the global error handler logged as
 * "Unhandled error" and answered 500. Only that case is mapped: any other error
 * (JWKS fetch, network, misconfiguration) still goes to the error handler.
 */
export function withMalformedTokenAs401(clerk: Middleware): Middleware {
  return (req, res, next) => {
    clerk(req, res, (err?: unknown) => {
      // A SyntaxError only means "bad token" when the token itself really cannot
      // be decoded; any other SyntaxError is a Clerk/internal fault and is forwarded.
      if (err instanceof SyntaxError && isUndecodableBearer(req)) {
        recordAuthDenial(req.path || req.url || 'unknown', 'no_session')
        res.status(401).json({ error: 'Authentication required' })
        return
      }
      next(err)
    })
  }
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

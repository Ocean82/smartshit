/**
 * Rate limiting middleware for Express endpoints.
 * Uses express-rate-limit for standardized rate limiting with proper headers.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import type { Request } from 'express'
import { getAuth } from '@clerk/express'

/**
 * Build a rate-limit key for an unauthenticated request.
 *
 * `ipKeyGenerator` normalises IPv6 addresses down to a /56 subnet. Keying on a
 * raw IPv6 address lets a single client rotate through an effectively unlimited
 * address space and bypass every limit, so this helper must be used for any
 * IP-derived key.
 */
function ipKey(req: Request): string {
  const ip = req.ip ?? req.socket.remoteAddress
  return ip ? ipKeyGenerator(ip) : 'unknown'
}

/**
 * Extract user ID from Clerk auth on the request, falling back to client IP.
 * Must use getAuth() — Clerk Express does not expose a plain `req.auth.userId`.
 */
function getUserKey(req: Request): string {
  try {
    const auth = getAuth(req)
    if (auth.userId) return auth.userId
  } catch {
    // Middleware may not have attached auth yet — fall back to IP
  }
  return ipKey(req)
}

/**
 * Rate limiter for chat endpoints (/api/chat/stream, /api/chat).
 * 20 requests per minute per user — protects against abuse and LLM cost spikes.
 */
export const chatRateLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 20,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please wait a moment before sending another message.',
    retryAfterSeconds: 60,
  },
  keyGenerator: getUserKey,
})

/**
 * Rate limiter for the formula-level AI functions (/api/ai-function).
 * 30 calls per minute per user — a filled-down column issues many small calls,
 * so this is looser than chat while still capping runaway spend.
 */
export const aiFunctionRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded. Maximum 30 AI function calls per minute.',
    result: null,
  },
  keyGenerator: getUserKey,
})

/**
 * Rate limiter for the checkout endpoint — stricter to prevent payment abuse.
 * 5 requests per minute per user.
 */
export const checkoutRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many checkout attempts. Please try again in a moment.',
  },
  keyGenerator: getUserKey,
})

/**
 * Global rate limiter — a very generous backstop for all endpoints.
 * 100 requests per minute per IP.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please slow down.',
  },
  keyGenerator: ipKey,
  // Skip health endpoint
  skip: (req) => req.path === '/health',
})

/**
 * Rate limiter for public shared workbook access (/api/shared/:token).
 * 10 requests per minute per IP — prevents token enumeration attempts
 * while allowing normal viewing (one page load = one request).
 */
export const sharedAccessRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please wait before accessing more shared workbooks.',
  },
  keyGenerator: ipKey,
})

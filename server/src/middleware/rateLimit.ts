/**
 * Rate limiting middleware for Express endpoints.
 * Uses express-rate-limit for standardized rate limiting with proper headers.
 */

import rateLimit from 'express-rate-limit'
import type { Request } from 'express'

/**
 * Extract user ID from Clerk auth on the request, falling back to IP.
 */
function getUserKey(req: Request): string {
  // Clerk middleware attaches auth to the request
  const auth = (req as unknown as { auth?: { userId?: string } }).auth
  return auth?.userId || req.ip || req.socket.remoteAddress || 'unknown'
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
  // Skip health endpoint
  skip: (req) => req.path === '/health',
})

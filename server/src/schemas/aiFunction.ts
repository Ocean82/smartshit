/**
 * Zod schemas for the AI Function endpoint validation.
 */

import { z } from 'zod'

/** BYOK credentials for AI function calls — SSRF-hardened. */
const byokSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().refine((url) => {
    // Block SSRF: reject private/internal IP ranges and non-HTTPS schemes
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
      const hostname = parsed.hostname.toLowerCase()
      // Block internal/private ranges
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false
      if (hostname.startsWith('10.')) return false
      if (hostname.startsWith('172.') && /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false
      if (hostname.startsWith('192.168.')) return false
      if (hostname.startsWith('169.254.')) return false // AWS metadata
      if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false
      if (hostname === '0.0.0.0' || hostname === '[::1]') return false
      return true
    } catch {
      return false
    }
  }, { message: 'baseUrl must be a public HTTPS endpoint' }),
  model: z.string().optional(),
  provider: z.string().optional(),
})

/** POST /api/ai-function request body. */
export const aiFunctionBodySchema = z.object({
  function: z.string().min(1, 'function name is required'),
  args: z.record(z.string(), z.unknown()),
  byok: byokSchema.optional(),
})

export type AIFunctionBody = z.infer<typeof aiFunctionBodySchema>

/**
 * Shared BYOK (Bring Your Own Key) Zod schemas — SSRF-hardened.
 *
 * Used by chat and AI-function endpoints so the allowlist cannot drift.
 */

import { z } from 'zod'

/** Return true when a BYOK baseUrl is a public HTTPS endpoint. */
export function isPublicHttpsByokUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false
    if (hostname.startsWith('10.')) return false
    if (hostname.startsWith('172.') && /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false
    if (hostname.startsWith('192.168.')) return false
    if (hostname.startsWith('169.254.')) return false
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false
    if (hostname === '0.0.0.0' || hostname === '[::1]') return false
    return true
  } catch {
    return false
  }
}

/** HTTPS-only BYOK base URL that rejects private/link-local hosts. */
export const byokBaseUrlSchema = z
  .string()
  .url()
  .refine(isPublicHttpsByokUrl, { message: 'baseUrl must be a public HTTPS endpoint' })

/** BYOK credentials attached to chat / AI-function requests. */
export const byokSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: byokBaseUrlSchema,
  model: z.string().optional(),
  provider: z.string().optional(),
})

export type ByokCredentials = z.infer<typeof byokSchema>

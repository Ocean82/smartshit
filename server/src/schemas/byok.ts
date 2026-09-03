/**
 * Shared BYOK (Bring Your Own Key) Zod schemas — SSRF-hardened.
 *
 * Used by chat and AI-function endpoints so the allowlist cannot drift.
 *
 * Two layers of defence:
 *  1. `isPublicHttpsByokUrl` — synchronous, no I/O. Rejects non-HTTPS, private
 *     hostnames, and IP literals (including decimal/octal/hex/IPv6-mapped
 *     encodings) that fall in private/loopback/link-local ranges. Used by the
 *     Zod schema so bad URLs never reach a handler.
 *  2. `assertPublicByokHost` — asynchronous. Resolves the hostname via DNS and
 *     rejects when ANY resolved address is private. Defeats DNS-rebinding and
 *     public names that point at internal IPs. Must be called on the BYOK path
 *     immediately before the outbound fetch.
 */

import { z } from 'zod'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/**
 * True when a numeric IP string sits in a range that must never be reachable
 * from a server-side fetch (loopback, private, link-local, CGNAT, IPv6 ULA,
 * IPv4-mapped IPv6, etc.). `family` is 4 or 6 as reported by net.isIP().
 */
function isPrivateIp(ip: string, family: number): boolean {
  const addr = ip.toLowerCase()

  if (family === 4) return isPrivateIpv4(addr)

  // IPv6.
  if (addr === '::' || addr === '::1') return true            // unspecified, loopback
  if (addr.startsWith('fe80')) return true                     // link-local fe80::/10
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // unique-local fc00::/7

  // IPv4-mapped / -compatible (::ffff:127.0.0.1, ::127.0.0.1). Node normalizes
  // these to hex groups (::ffff:7f00:1), so pull out the embedded v4 address —
  // whether written dotted-decimal or as two 16-bit hex groups — and re-check.
  const embedded = extractEmbeddedIpv4(addr)
  if (embedded) return isPrivateIpv4(embedded)
  return false
}

/** Extract the embedded IPv4 from an ::ffff: / :: prefixed IPv6, or null. */
function extractEmbeddedIpv4(addr: string): string | null {
  const m = addr.match(/^::(?:ffff:)?(.+)$/)
  if (!m) return null
  const tail = m[1]
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(tail)) return tail // dotted form
  const hex = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)         // two hex groups
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return [(hi >>> 8) & 255, hi & 255, (lo >>> 8) & 255, lo & 255].join('.')
  }
  return null
}

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Not dotted-quad (shouldn't happen after canonicalization) — treat as unsafe.
    return true
  }
  const [a, b] = parts
  if (a === 0) return true                       // 0.0.0.0/8
  if (a === 10) return true                      // 10.0.0.0/8
  if (a === 127) return true                     // 127.0.0.0/8 loopback (all of it)
  if (a === 169 && b === 254) return true        // 169.254.0.0/16 link-local (IMDS)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true        // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  return false
}

/**
 * Canonicalize an IP-literal hostname into dotted-quad / normalized IPv6 so the
 * range checks can't be bypassed with decimal (2130706433), octal (0177.0.0.1),
 * hex (0x7f.0.0.1), or short-form encodings. Returns null if `host` is not an
 * IP literal (i.e. it's a DNS name to be resolved later).
 */
function canonicalizeIpLiteral(host: string): { ip: string; family: number } | null {
  // Strip IPv6 brackets if present.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host

  const direct = isIP(bare)
  if (direct === 4 || direct === 6) return { ip: bare, family: direct }

  // Pure decimal, e.g. 2130706433 → 127.0.0.1.
  if (/^\d+$/.test(bare)) {
    const n = Number(bare)
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      return { ip: [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'), family: 4 }
    }
    return { ip: '0.0.0.0', family: 4 } // out-of-range numeric host → treat unsafe
  }

  // Dotted forms with octal/hex octets, e.g. 0177.0.0.1 or 0x7f.0.0.1.
  const octets = bare.split('.')
  if (octets.length === 4 && octets.every((o) => /^(0x[0-9a-f]+|\d+)$/.test(o))) {
    const nums = octets.map((o) => (o.startsWith('0x') ? parseInt(o, 16) : parseInt(o, o.startsWith('0') && o.length > 1 ? 8 : 10)))
    if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return { ip: nums.join('.'), family: 4 }
    }
    return { ip: '0.0.0.0', family: 4 }
  }

  return null // DNS name
}

/** Return true when a BYOK baseUrl is a public HTTPS endpoint (no DNS I/O). */
export function isPublicHttpsByokUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false

    const hostname = parsed.hostname.toLowerCase()
    if (!hostname) return false
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false

    // IP literal (any encoding) → canonicalize and range-check.
    const literal = canonicalizeIpLiteral(hostname)
    if (literal) return !isPrivateIp(literal.ip, literal.family)

    // DNS name — the synchronous layer can't resolve it. Accept the string here;
    // assertPublicByokHost() performs the resolved-IP check before fetching.
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the BYOK host and throw if any resolved address is private. Call this
 * on the BYOK request path immediately before the outbound fetch. This is what
 * stops DNS-rebinding and public hostnames that map to internal IPs.
 */
export async function assertPublicByokHost(url: string): Promise<void> {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    throw new Error('Invalid BYOK baseUrl')
  }
  if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1)

  // IP literals were already range-checked synchronously; re-check defensively.
  const literal = canonicalizeIpLiteral(hostname)
  if (literal) {
    if (isPrivateIp(literal.ip, literal.family)) {
      throw new Error('BYOK baseUrl resolves to a non-public address')
    }
    return
  }

  let results: Array<{ address: string; family: number }>
  try {
    results = await lookup(hostname, { all: true })
  } catch {
    throw new Error(`Could not resolve BYOK host "${hostname}"`)
  }
  if (results.length === 0) throw new Error(`Could not resolve BYOK host "${hostname}"`)

  for (const { address, family } of results) {
    if (isPrivateIp(address, family)) {
      throw new Error('BYOK baseUrl resolves to a non-public address')
    }
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

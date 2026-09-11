/**
 * Hyperlink helpers — URL detect/normalize and safe open.
 * ponytail: http(s) only; mailto/sheet links later.
 */

import type { Hyperlink } from '@/types'

export type { Hyperlink }

const URL_RE = /^(https?:\/\/|www\.)[^\s]+$/i

/** Return a normalized http(s) URL, or null if the text is not a bare URL. */
export function parseHyperlinkUrl(text: string): string | null {
  const t = text.trim()
  if (!URL_RE.test(t)) return null
  const withScheme = /^www\./i.test(t) ? `https://${t}` : t
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

/** True when the cell value itself is the link target (auto-linked / URL-as-value). */
export function isUrlBoundHyperlink(
  value: string | number | boolean | null | undefined,
  hyperlink: Hyperlink | undefined,
): boolean {
  if (!hyperlink?.url || typeof value !== 'string') return false
  return parseHyperlinkUrl(value) === hyperlink.url
}

/**
 * Next hyperlink after an in-cell value edit.
 * - Bare URL → auto-link
 * - URL-bound cell edited to non-URL → clear
 * - Labeled link (value ≠ url) → keep metadata on text edits
 * - Formula / non-string → clear
 */
export function resolveHyperlinkOnEdit(args: {
  prevValue: string | number | boolean | null | undefined
  prevHyperlink: Hyperlink | undefined
  nextValue: string | number | boolean | null
  formula?: string
}): Hyperlink | undefined {
  if (args.formula) return undefined
  if (typeof args.nextValue === 'string') {
    const parsed = parseHyperlinkUrl(args.nextValue)
    if (parsed) return { url: parsed, displayText: args.prevHyperlink?.displayText }
    if (isUrlBoundHyperlink(args.prevValue, args.prevHyperlink)) return undefined
    return args.prevHyperlink
  }
  return undefined
}

/** Normalize user-entered URL for storage; null if unsafe/invalid. */
export function normalizeHyperlinkUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  // Reject explicit non-http(s) schemes before inventing https://
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) return null
  const withScheme = /^https?:\/\//i.test(t)
    ? t
    : /^www\./i.test(t)
      ? `https://${t}`
      : `https://${t}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

export function openHyperlink(url: string): void {
  const safe = normalizeHyperlinkUrl(url)
  if (!safe || typeof window === 'undefined') return
  window.open(safe, '_blank', 'noopener,noreferrer')
}

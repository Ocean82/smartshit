/**
 * Shared utilities for the AI analysis module.
 */

/** Parse a numeric value, stripping currency symbols, commas, and accounting parentheses. */
export function parseNumeric(value: string | number | boolean | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value == null || typeof value === 'boolean') return null
  const text = String(value).trim()
  if (!text) return null
  const negative = /^\(.*\)$/.test(text)
  const cleaned = text.replace(/[()$,%\s]/g, '').replace(/,/g, '')
  const numeric = Number(cleaned)
  if (!Number.isFinite(numeric)) return null
  return negative ? -numeric : numeric
}

/** Normalize a header value to a trimmed lowercase string. */
export function normalizeHeader(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().toLowerCase()
}

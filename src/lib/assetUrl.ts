/**
 * Resolve a public asset path against Vite's `base` (production: `/app/`).
 * Hardcoded absolute paths like `/models/...` hit the site root and 404 under /app/.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\//, '')
  return `${normalizedBase}${normalizedPath}`
}

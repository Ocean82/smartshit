/**
 * Service Worker for smartsh!t PWA.
 *
 * Strategy:
 * - Navigations / app HTML → network-first (stale Clerk client breaks auth)
 * - API calls → network-first with cache fallback
 * - Same-origin static assets → cache-first
 * - Clerk / Stripe / CAPTCHA origins → never intercept
 */

const CACHE_NAME = 'smartsht-v3-csp'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

/**
 * Clerk FAPI, bot protection, and handshake URLs must hit the network with
 * the page's credentials. Wrapping them in respondWith breaks sign-in.
 */
function shouldBypassServiceWorker(url) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true

  const host = url.hostname
  if (
    host === 'clerk.smartsht.com' ||
    host === 'api.clerk.com' ||
    host === 'img.clerk.com' ||
    host === 'challenges.cloudflare.com' ||
    host === 'clerk-telemetry.com' ||
    host.endsWith('.clerk.accounts.dev') ||
    host.endsWith('.protect.clerk.com') ||
    host.endsWith('.clerk-telemetry.com') ||
    host.endsWith('.clerk.com')
  ) {
    return true
  }

  for (const key of url.searchParams.keys()) {
    if (key.startsWith('__clerk')) return true
  }

  return false
}

function isAppHtmlRequest(request, url) {
  if (request.mode === 'navigate') return true
  if (url.origin !== self.location.origin) return false
  const path = url.pathname
  return path === '/app' || path === '/app/' || path.endsWith('.html')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (shouldBypassServiceWorker(url)) return

  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  if (isAppHtmlRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/app/index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
    }),
  )
})

/**
 * serverAccess — the single answer to "may the client call our authenticated
 * backend right now?".
 *
 * This is traffic hygiene and UX, NOT security: the server's `requireAuth`
 * stays the real enforcement point. Anonymous (signed-out) visitors never send
 * backend requests, so they neither flood auth-denial metrics nor see 401s.
 *
 * No React-component or Zustand dependency (only the `useSyncExternalStore`
 * hook wrapper), so transport modules can import it freely.
 */
import { useSyncExternalStore } from 'react'

export type AuthStatus = 'dev' | 'pending' | 'anonymous' | 'signed-in'

/** How long Clerk may stay unreported before we treat the visitor as anonymous. */
export const PENDING_TIMEOUT_MS = 8_000
const MAX_SETTLE_WAIT_MS = 10_000

function hasClerkKey(): boolean {
  return Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
}

// Lazily initialised so the build-time key is read on first use (and tests can
// stub the env before first use).
let status: AuthStatus | null = null
let pendingTimer: ReturnType<typeof setTimeout> | null = null
let initialised = false
const listeners = new Set<(s: AuthStatus) => void>()
let clerkLoaded = false
const loadedListeners = new Set<() => void>()

export function getAuthStatus(): AuthStatus {
  if (status === null) status = hasClerkKey() ? 'pending' : 'dev'
  return status
}

/** True when the authenticated backend may be called (dev build or signed in). */
export function canCallServer(): boolean {
  const s = getAuthStatus()
  return s === 'dev' || s === 'signed-in'
}

function clearTimer(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

function publish(next: AuthStatus): void {
  if (getAuthStatus() === next) return
  status = next
  listeners.forEach((fn) => fn(next))
}

/**
 * Arm the bounded `pending` timer. Called once by main.tsx before render, only
 * when the Clerk key is set. Idempotent; arms nothing in dev builds.
 */
export function initServerAccess(): void {
  if (initialised) return
  initialised = true
  if (!hasClerkKey()) return
  if (getAuthStatus() !== 'pending') return
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    if (getAuthStatus() === 'pending') publish('anonymous')
  }, PENDING_TIMEOUT_MS)
}

/** Called only by the Clerk sync component. Clears the pending timer. */
export function setAuthStatus(next: AuthStatus): void {
  clearTimer()
  publish(next)
  if (!clerkLoaded) {
    clerkLoaded = true
    loadedListeners.forEach((fn) => fn())
  }
}

/** True once Clerk itself has reported (as opposed to the 8 s timeout fallback). */
export function isClerkLoaded(): boolean {
  return clerkLoaded
}

export function useClerkLoaded(): boolean {
  return useSyncExternalStore(
    (cb) => {
      loadedListeners.add(cb)
      return () => {
        loadedListeners.delete(cb)
      }
    },
    isClerkLoaded,
    isClerkLoaded,
  )
}

export function subscribeAuthStatus(fn: (s: AuthStatus) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(subscribeAuthStatus as (cb: () => void) => () => void, getAuthStatus, getAuthStatus)
}

/**
 * Resolve once status leaves `pending`, or after `timeoutMs` (clamped 0..10000)
 * with whatever status it has then. Never rejects.
 */
export function whenAuthSettled(timeoutMs = 3_000): Promise<AuthStatus> {
  const current = getAuthStatus()
  if (current !== 'pending') return Promise.resolve(current)
  const wait = Math.min(Math.max(Number.isFinite(timeoutMs) ? timeoutMs : 0, 0), MAX_SETTLE_WAIT_MS)
  return new Promise<AuthStatus>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = subscribeAuthStatus((s) => {
      if (s === 'pending') return
      if (timer) clearTimeout(timer)
      unsubscribe()
      resolve(s)
    })
    timer = setTimeout(() => {
      unsubscribe()
      resolve(getAuthStatus())
    }, wait)
  })
}

/** Test-only: forget all state so the next read re-derives from the env. */
export function _resetServerAccessForTests(): void {
  clearTimer()
  status = null
  initialised = false
  clerkLoaded = false
  listeners.clear()
  loadedListeners.clear()
}

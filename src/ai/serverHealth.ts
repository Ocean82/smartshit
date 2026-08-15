import { fetchServerHealth, type ServerHealth } from '@/ai/agentClient'

export type ServerHealthListener = (health: ServerHealth | null) => void

const HEALTHY_INTERVAL_MS = 15_000
const MAX_INTERVAL_MS = 60_000
/** Covers React StrictMode unmount/remount without a second /health fetch. */
const STOP_GRACE_MS = 250

const listeners = new Set<ServerHealthListener>()
let current: ServerHealth | null = null
let timeoutId: ReturnType<typeof setTimeout> | null = null
let stopGraceId: ReturnType<typeof setTimeout> | null = null
let intervalMs = HEALTHY_INTERVAL_MS
let inFlight = false
let started = false

function notify(health: ServerHealth | null): void {
  current = health
  for (const listener of listeners) {
    listener(health)
  }
}

function clearScheduled(): void {
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
}

function clearStopGrace(): void {
  if (stopGraceId !== null) {
    clearTimeout(stopGraceId)
    stopGraceId = null
  }
}

function scheduleNext(): void {
  clearScheduled()
  if (listeners.size === 0) return
  timeoutId = setTimeout(() => {
    void poll()
  }, intervalMs)
}

async function poll(): Promise<void> {
  if (inFlight || listeners.size === 0) return
  inFlight = true
  try {
    const result = await fetchServerHealth()
    intervalMs = result?.ok ? HEALTHY_INTERVAL_MS : Math.min(intervalMs * 2, MAX_INTERVAL_MS)
    notify(result)
  } finally {
    inFlight = false
    if (listeners.size > 0) scheduleNext()
  }
}

function startOrResume(): void {
  if (!started) {
    started = true
    intervalMs = HEALTHY_INTERVAL_MS
    void poll()
    return
  }
  if (inFlight || timeoutId !== null) return
  if (current === null) void poll()
  else scheduleNext()
}

export function getServerHealthSnapshot(): ServerHealth | null {
  return current
}

/**
 * Shared /health poller. Multiple UI subscribers share one in-flight request
 * and one timer. Polling stops shortly after the last subscriber unsubscribes.
 */
export function subscribeServerHealth(listener: ServerHealthListener): () => void {
  listeners.add(listener)
  listener(current)
  clearStopGrace()
  startOrResume()

  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    clearScheduled()
    clearStopGrace()
    stopGraceId = setTimeout(() => {
      stopGraceId = null
      if (listeners.size > 0) return
      started = false
      clearScheduled()
    }, STOP_GRACE_MS)
  }
}

/** Test-only: reset module state between cases. */
export function resetServerHealthForTests(): void {
  listeners.clear()
  current = null
  intervalMs = HEALTHY_INTERVAL_MS
  inFlight = false
  started = false
  clearScheduled()
  clearStopGrace()
}

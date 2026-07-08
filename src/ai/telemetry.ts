type TelemetryCounterKey =
  | 'importTruncationEvents'
  | 'previewDeniedActions'
  | 'deterministicResponses'
  | 'llmResponses'
  | 'hybridResponses'
  | 'fallbackResponses'

export interface TelemetryCounters {
  importTruncationEvents: number
  previewDeniedActions: number
  deterministicResponses: number
  llmResponses: number
  hybridResponses: number
  fallbackResponses: number
}

export interface TelemetrySnapshot {
  counters: TelemetryCounters
  events: Array<{
    type: TelemetryCounterKey
    detail: string
    timestamp: string
  }>
  updatedAt: string
}

const STORAGE_KEY = 'smartshit-v1-telemetry'
const MAX_EVENT_HISTORY = 100

function emptyCounters(): TelemetryCounters {
  return {
    importTruncationEvents: 0,
    previewDeniedActions: 0,
    deterministicResponses: 0,
    llmResponses: 0,
    hybridResponses: 0,
    fallbackResponses: 0,
  }
}

function emptySnapshot(): TelemetrySnapshot {
  return {
    counters: emptyCounters(),
    events: [],
    updatedAt: new Date(0).toISOString(),
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

export function loadTelemetrySnapshot(): TelemetrySnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptySnapshot()
    const parsed = JSON.parse(raw) as TelemetrySnapshot
    if (!parsed?.counters) return emptySnapshot()
    return {
      counters: { ...emptyCounters(), ...parsed.counters },
      events: Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENT_HISTORY) : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : nowIso(),
    }
  } catch {
    return emptySnapshot()
  }
}

export function saveTelemetrySnapshot(snapshot: TelemetrySnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore storage issues in constrained browser environments.
  }
}

export function recordTelemetry(
  key: TelemetryCounterKey,
  detail: string,
): TelemetrySnapshot {
  const snapshot = loadTelemetrySnapshot()
  snapshot.counters[key] += 1
  snapshot.events.push({
    type: key,
    detail,
    timestamp: nowIso(),
  })
  snapshot.events = snapshot.events.slice(-MAX_EVENT_HISTORY)
  snapshot.updatedAt = nowIso()
  saveTelemetrySnapshot(snapshot)
  return snapshot
}

export function resetTelemetrySnapshot(): TelemetrySnapshot {
  const snapshot = {
    counters: emptyCounters(),
    events: [],
    updatedAt: nowIso(),
  }
  saveTelemetrySnapshot(snapshot)
  return snapshot
}


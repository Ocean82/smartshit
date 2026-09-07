type TelemetryCounterKey =
  | 'importTruncationEvents'
  | 'previewDeniedActions'
  | 'deterministicResponses'
  | 'llmResponses'
  | 'hybridResponses'
  | 'fallbackResponses'
  | 'feedbackUp'
  | 'feedbackDown'
  | 'sandboxExecutions'
  | 'sandboxErrors'
  | 'macroExecution'
  | 'capabilityRouterEvents'

export interface TelemetryCounters {
  importTruncationEvents: number
  previewDeniedActions: number
  deterministicResponses: number
  llmResponses: number
  hybridResponses: number
  fallbackResponses: number
  feedbackUp: number
  feedbackDown: number
  sandboxExecutions: number
  sandboxErrors: number
  macroExecution: number
  capabilityRouterEvents: number
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

// amazonq-ignore-next-line
const STORAGE_KEY = 'smartsht-v1-telemetry'
const MAX_EVENT_HISTORY = 100

function emptyCounters(): TelemetryCounters {
  return {
    importTruncationEvents: 0,
    previewDeniedActions: 0,
    deterministicResponses: 0,
    llmResponses: 0,
    hybridResponses: 0,
    fallbackResponses: 0,
    feedbackUp: 0,
    feedbackDown: 0,
    sandboxExecutions: 0,
    sandboxErrors: 0,
    macroExecution: 0,
    capabilityRouterEvents: 0,
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

/** Structured Tier-2 routing event for miss analysis / capability discovery. */
export interface CapabilityRouterTelemetryPayload {
  outcome:
    | 'miss'
    | 'ambiguous_clarify'
    | 'clarify'
    | 'preview'
    | 'claim'
    | 'pass_safety'
  message: string
  top3Capabilities: Array<{ id: string; score: number }>
  score: number | null
  routedTier: 2
  mode?: string
}

const MAX_ROUTE_MESSAGE_CHARS = 200

export function recordCapabilityRouterTelemetry(
  payload: CapabilityRouterTelemetryPayload,
): TelemetrySnapshot {
  const trimmed = payload.message.trim()
  const message = trimmed.length > MAX_ROUTE_MESSAGE_CHARS
    ? `${trimmed.slice(0, MAX_ROUTE_MESSAGE_CHARS)}…`
    : trimmed
  return recordTelemetry(
    'capabilityRouterEvents',
    JSON.stringify({ ...payload, message }),
  )
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


import { useEffect, useMemo, useState } from 'react'
import { loadTelemetrySnapshot, resetTelemetrySnapshot } from '@/ai/telemetry'

export function TelemetryDebugPanel() {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState(() => loadTelemetrySnapshot())

  const totals = useMemo(() => snapshot.counters, [snapshot])
  const lastEvents = useMemo(() => snapshot.events.slice(-8).reverse(), [snapshot])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 't') return
      event.preventDefault()
      setOpen((prev) => {
        if (!prev) refresh()
        return !prev
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function refresh() {
    setSnapshot(loadTelemetrySnapshot())
  }

  function reset() {
    setSnapshot(resetTelemetrySnapshot())
  }

  return (
    <div className="fixed bottom-3 right-3 z-[80]">
      <button
        type="button"
        className="px-2 py-1 rounded-md bg-slate-900 text-white text-xs shadow hover:bg-slate-800"
        onClick={() => {
          if (!open) refresh()
          setOpen(!open)
        }}
        title="Open telemetry debug panel"
        aria-keyshortcuts="Control+Shift+T"
      >
        Telemetry
      </button>

      {open ? (
        <div className="mt-2 w-[360px] max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-xs">
          <div className="flex items-center justify-between mb-2">
            <strong className="text-slate-800">V1 Telemetry (Dev)</strong>
            <span className="text-slate-500">{new Date(snapshot.updatedAt).toLocaleTimeString()}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <Stat label="Import Truncation" value={totals.importTruncationEvents} />
            <Stat label="Preview Denied" value={totals.previewDeniedActions} />
            <Stat label="Deterministic" value={totals.deterministicResponses} />
            <Stat label="LLM" value={totals.llmResponses} />
            <Stat label="Hybrid" value={totals.hybridResponses} />
            <Stat label="Fallback" value={totals.fallbackResponses} />
          </div>

          <div className="mb-2 text-slate-700 font-medium">Recent events</div>
          <div className="max-h-40 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 space-y-1">
            {lastEvents.length === 0 ? (
              <div className="text-slate-500">No events recorded yet.</div>
            ) : (
              lastEvents.map((event, i) => (
                <div key={`${event.timestamp}-${i}`} className="text-[11px] text-slate-700">
                  <span className="font-medium">{event.type}</span> — {event.detail}
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
              onClick={refresh}
            >
              Refresh
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 p-2 bg-slate-50">
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-900 font-semibold">{value}</div>
    </div>
  )
}


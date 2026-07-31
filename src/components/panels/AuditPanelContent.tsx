/**
 * AuditPanelContent — The audit panel content for embedding inside a DockPanel.
 * This is the inner content of the auditor (no outer wrapper, no visibility toggle).
 */

import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { runAudit } from '@/auditor'
import type { AuditResult, AuditFinding, Severity } from '@/auditor/types'
import { AuditFindingCard } from '@/components/AuditFindingCard'
import { ShieldCheck, Loader2, RefreshCw } from 'lucide-react'

const SEVERITY_FILTERS = ['all', 'critical', 'high', 'medium', 'low', 'info'] as const
type FilterValue = (typeof SEVERITY_FILTERS)[number]

export function AuditPanelContent() {
  const { workbook, activeSheetId, getComputedValue } = useStore()
  const [result, setResult] = useState<AuditResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterValue>('all')

  const activeSheet = workbook.sheets.find((s) => s.id === activeSheetId)

  const handleRunAudit = useCallback(() => {
    if (!activeSheet) return
    setLoading(true)
    requestAnimationFrame(() => {
      try {
        const auditResult = runAudit(activeSheet, getComputedValue)
        setResult(auditResult)
      } catch (err) {
        console.error('Audit failed:', err)
      } finally {
        setLoading(false)
      }
    })
  }, [activeSheet, getComputedValue])

  // Auto-run on first open
  useEffect(() => {
    if (!result && activeSheet && Object.keys(activeSheet.cells).length > 0) {
      handleRunAudit()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCellNavigate = useCallback((row: number, col: number) => {
    useStore.getState().setSelection({ startRow: row, startCol: col, endRow: row, endCol: col })
  }, [])

  const handleFix = useCallback((finding: AuditFinding) => {
    if (!finding.fixActions?.length) return
    const store = useStore.getState()
    store.pushHistory('Audit auto-fix')
    for (const action of finding.fixActions) {
      const { cellId, formula, value } = action
      if (formula) {
        const formulaStr = formula.startsWith('=') ? formula : `=${formula}`
        store.setCellValue(cellId, null, formulaStr)
      } else if (value !== undefined) {
        store.setCellValue(cellId, value)
      }
    }
    setTimeout(() => handleRunAudit(), 200)
  }, [handleRunAudit])

  const filteredFindings = result
    ? filter === 'all'
      ? result.findings
      : result.findings.filter((f) => f.severity === filter)
    : []

  const severityCounts: Record<Severity, number> = result
    ? {
        critical: result.findings.filter((f) => f.severity === 'critical').length,
        high: result.findings.filter((f) => f.severity === 'high').length,
        medium: result.findings.filter((f) => f.severity === 'medium').length,
        low: result.findings.filter((f) => f.severity === 'low').length,
        info: result.findings.filter((f) => f.severity === 'info').length,
      }
    : { critical: 0, high: 0, medium: 0, low: 0, info: 0 }

  const scoreColor = result
    ? result.score >= 80 ? 'text-emerald-600'
      : result.score >= 50 ? 'text-amber-600'
        : 'text-rose-600'
    : ''

  const scoreBarColor = result
    ? result.score >= 80 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
      : result.score >= 50 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
        : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
    : ''

  return (
    <div className="flex flex-col h-full bg-slate-50/20">
      {/* Score display */}
      <div className="px-4 py-4 border-b border-slate-100 shrink-0 bg-white shadow-sm">
        {!result && !loading && (
          <button
            type="button"
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-xs font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-wider"
            onClick={handleRunAudit}
          >
            <ShieldCheck size={14} />
            Scan Spreadsheet
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-4">
            <Loader2 size={24} className="animate-spin text-blue-600 opacity-80" />
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">Auditing formulas…</span>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Health Score</span>
                <p className="text-[10px] text-slate-400 font-medium">
                  {result.totalCells} cells scanned
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className={`text-2xl font-black tabular-nums leading-none ${scoreColor}`}>
                    {result.score}<span className="text-xs font-bold opacity-40">/100</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90 shadow-sm border border-slate-100"
                  onClick={handleRunAudit}
                  title="Re-run audit"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-50">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${scoreBarColor}`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <p className="text-[10px] text-slate-600 font-medium leading-tight">
                {result.summary}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      {result && result.findings.length > 0 && (
        <div className="px-3 py-2.5 flex gap-1.5 flex-wrap border-b border-slate-100 shrink-0 bg-white/50 backdrop-blur-sm">
          {SEVERITY_FILTERS.map((sev) => {
            const count = sev === 'all' ? result.findings.length : severityCounts[sev]
            if (sev !== 'all' && count === 0) return null
            
            const activeColors = sev === 'critical' ? 'bg-rose-100 border-rose-200 text-rose-700'
              : sev === 'high' ? 'bg-orange-100 border-orange-200 text-orange-700'
              : 'bg-blue-100 border-blue-200 text-blue-700'

            return (
              <button
                key={sev}
                type="button"
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all uppercase tracking-tight ${
                  filter === sev
                    ? activeColors
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 shadow-sm'
                }`}
                onClick={() => setFilter(sev)}
              >
                {sev === 'all' ? 'All' : sev} <span className="opacity-50 ml-0.5">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin">
        {!result && !loading && (
          <div className="text-center text-[11px] text-gray-400 mt-8 px-4 leading-relaxed">
            Click "Run Audit" to scan your spreadsheet for formula errors, inconsistencies, and potential problems.
          </div>
        )}

        {result && filteredFindings.length === 0 && (
          <div className="text-center text-[11px] text-gray-400 mt-8">
            No findings for this filter ✨
          </div>
        )}

        {filteredFindings.map((finding) => (
          <AuditFindingCard
            key={finding.id}
            finding={finding}
            onCellNavigate={handleCellNavigate}
            onFix={handleFix}
          />
        ))}
      </div>
    </div>
  )
}

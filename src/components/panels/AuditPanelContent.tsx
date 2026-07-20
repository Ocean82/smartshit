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
    if (!finding.fixAction) return
    const store = useStore.getState()
    const { cellId, formula, value } = finding.fixAction
    store.pushHistory('Audit auto-fix')
    if (formula) {
      const formulaStr = formula.startsWith('=') ? formula : `=${formula}`
      store.setCellValue(cellId, null, formulaStr)
    } else if (value !== undefined) {
      store.setCellValue(cellId, value)
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
        : 'text-red-600'
    : ''

  const scoreBarColor = result
    ? result.score >= 80 ? 'bg-emerald-500'
      : result.score >= 50 ? 'bg-amber-500'
        : 'bg-red-500'
    : ''

  return (
    <div className="flex flex-col h-full">
      {/* Score display */}
      <div className="px-3 py-3 border-b border-gray-100 shrink-0">
        {!result && !loading && (
          <button
            type="button"
            className="w-full py-2.5 px-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm flex items-center justify-center gap-2"
            onClick={handleRunAudit}
          >
            <ShieldCheck size={13} />
            Run Audit
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-gray-500">
            <Loader2 size={14} className="animate-spin text-blue-600" />
            Analyzing spreadsheet…
          </div>
        )}

        {result && !loading && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-gray-500">Health Score</span>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold tabular-nums ${scoreColor}`}>
                  {result.score}<span className="text-xs font-normal text-gray-400">/100</span>
                </span>
                <button
                  type="button"
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  onClick={handleRunAudit}
                  title="Re-run audit"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${scoreBarColor}`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">
              {result.summary} • {result.totalCells} cells ({result.formulaCells} formulas) in {result.durationMs}ms
            </p>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      {result && result.findings.length > 0 && (
        <div className="px-3 py-2 flex gap-1 flex-wrap border-b border-gray-100 shrink-0">
          {SEVERITY_FILTERS.map((sev) => {
            const count = sev === 'all' ? result.findings.length : severityCounts[sev]
            if (sev !== 'all' && count === 0) return null
            return (
              <button
                key={sev}
                type="button"
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                  filter === sev
                    ? 'bg-blue-100 border-blue-200 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
                onClick={() => setFilter(sev)}
              >
                {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Findings list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
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

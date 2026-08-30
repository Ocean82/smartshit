/**
 * ImportInsightsOverlay — Proactive "here's what I found" overlay shown
 * immediately after a file import. Surfaces key totals, structure, and
 * audit findings without requiring user initiation.
 *
 * Appears as a dismissible toast-like panel anchored to the bottom-right,
 * auto-dismisses after 30 seconds or on user interaction.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { useShallow } from 'zustand/react/shallow'
import { computeSheetInsights } from '@/ai/sheetInsights'
import { buildSheetProfile } from '@/ai/sheetProfile'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
  X,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react'

const AUTO_DISMISS_MS = 30_000

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function ImportInsightsOverlay() {
  const {
    getActiveSheet,
    getComputedValue,
    lastAuditResult,
    setActivePanel,
  } = useStore(useShallow((s) => ({
    getActiveSheet: s.getActiveSheet,
    getComputedValue: s.getComputedValue,
    lastAuditResult: s.lastAuditResult,
    setActivePanel: s.setActivePanel,
  })))

  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const sheet = getActiveSheet()
  const cellCount = Object.keys(sheet.cells).length

  // Detect when a new import happens via custom event from importOrchestration
  useEffect(() => {
    const handler = () => {
      if (dismissed) return
      setVisible(true)
      setDismissed(false)
    }
    document.addEventListener('smartsht:import-complete', handler)
    return () => document.removeEventListener('smartsht:import-complete', handler)
  }, [dismissed])

  // Auto-dismiss timer
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [visible])

  const insights = useMemo(() => {
    if (!visible || cellCount < 5) return null
    return computeSheetInsights(sheet, getComputedValue)
  }, [visible, sheet, getComputedValue, cellCount])

  const profile = useMemo(() => {
    if (!visible || cellCount < 5) return null
    return buildSheetProfile(sheet, getComputedValue)
  }, [visible, sheet, getComputedValue, cellCount])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setDismissed(true)
  }, [])

  const handleOpenInsights = useCallback(() => {
    setActivePanel('insights')
    handleDismiss()
  }, [setActivePanel, handleDismiss])

  const handleOpenAuditor = useCallback(() => {
    setActivePanel('auditor')
    handleDismiss()
  }, [setActivePanel, handleDismiss])

  if (!visible || !insights || !profile) return null

  const auditIssueCount = lastAuditResult?.findings?.length ?? 0
  const hasCriticalIssues = lastAuditResult?.findings?.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  ) ?? false
  const hasFinancialData = (insights.totalIncome ?? 0) > 0 || (insights.totalExpenses ?? 0) > 0
  const hasOutliers = (insights.outliers?.length ?? 0) > 0

  // Don't show if there's nothing interesting to report
  if (!hasFinancialData && auditIssueCount === 0 && !hasOutliers && insights.columnStats.length < 2) {
    return null
  }

  return (
    <div
      className="fixed bottom-20 right-4 md:bottom-6 md:right-[60px] z-50 w-[320px] max-w-[calc(100vw-2rem)] animate-slide-up"
      role="complementary"
      aria-label="Import insights summary"
    >
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'var(--surface-panel)',
          borderColor: 'var(--neutral-200)',
          boxShadow: '0 12px 40px oklch(0.1 0 0 / 0.12), 0 4px 12px oklch(0.1 0 0 / 0.06)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--neutral-100)', background: 'var(--neutral-50)' }}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={14} style={{ color: 'var(--accent-600)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
              Import Summary
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ background: 'var(--accent-50)', borderColor: 'var(--accent-200)', color: 'var(--accent-700)' }}
            >
              {profile.detectedPurpose}
            </span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md transition-colors"
            style={{ color: 'var(--neutral-400)' }}
            aria-label="Dismiss insights"
          >
            <X size={14} />
          </button>
        </div>

        {/* Structure summary */}
        <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--neutral-100)' }}>
          <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
            <span className="font-medium" style={{ color: 'var(--ink-primary)' }}>{profile.rowCount} rows</span>
            {' × '}
            <span className="font-medium" style={{ color: 'var(--ink-primary)' }}>{profile.colCount} columns</span>
            {insights.headers.length > 0 && (
              <span> · Headers: {insights.headers.slice(0, 4).join(', ')}{insights.headers.length > 4 ? '…' : ''}</span>
            )}
          </p>
        </div>

        {/* Financial KPIs */}
        {hasFinancialData && (
          <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--neutral-100)' }}>
            <div className="flex gap-3">
              {insights.totalIncome != null && (
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={11} className="text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">
                    {formatCurrency(insights.totalIncome)}
                  </span>
                </div>
              )}
              {insights.totalExpenses != null && (
                <div className="flex items-center gap-1.5">
                  <TrendingDown size={11} className="text-rose-600" />
                  <span className="text-xs font-medium text-rose-700">
                    {formatCurrency(insights.totalExpenses)}
                  </span>
                </div>
              )}
              {insights.netCashflow != null && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold ${insights.netCashflow >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                    Net: {formatCurrency(insights.netCashflow)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit findings callout */}
        {auditIssueCount > 0 && (
          <button
            type="button"
            onClick={handleOpenAuditor}
            className="w-full px-4 py-2.5 border-b flex items-center justify-between transition-colors hover:bg-amber-50/50"
            style={{ borderColor: 'var(--neutral-100)' }}
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={13} className={hasCriticalIssues ? 'text-red-500' : 'text-amber-500'} />
              <span className={`text-xs font-medium ${hasCriticalIssues ? 'text-red-700' : 'text-amber-700'}`}>
                {auditIssueCount} issue{auditIssueCount === 1 ? '' : 's'} found
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-600)' }}>
              <span>Open Auditor</span>
              <ChevronRight size={10} />
            </div>
          </button>
        )}

        {/* Outliers callout */}
        {hasOutliers && auditIssueCount === 0 && (
          <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--neutral-100)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={12} className="text-amber-500" />
              <span className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                {insights.outliers!.length} unusual value{insights.outliers!.length === 1 ? '' : 's'} detected
              </span>
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="px-4 py-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={handleOpenInsights}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors"
            style={{ color: 'var(--accent-600)' }}
          >
            <BarChart3 size={12} />
            <span>Full Insights</span>
            <ChevronRight size={10} />
          </button>
          <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            Auto-dismisses in 30s
          </span>
        </div>
      </div>
    </div>
  )
}

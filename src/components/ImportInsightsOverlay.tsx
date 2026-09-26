/**
 * ImportInsightsOverlay — Proactive "here's what I found" overlay shown
 * immediately after a file import. Surfaces key totals, structure, and
 * audit findings without requiring user initiation.
 *
 * Appears as a dismissible toast-like panel anchored to the bottom-right.
 * Auto-dismisses after 30 seconds unless critical/high audit findings are
 * present — those stay until the user dismisses or opens the auditor.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
/** Wait for post-import audit (~500ms) before arming auto-dismiss. */
const AUDIT_GRACE_MS = 1_000

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
  /** Import bump so grace/audit wait resets per import (not on stale audit). */
  const [importSeq, setImportSeq] = useState(0)
  /** True once audit landed for this import, or grace elapsed without critical findings. */
  const [canAutoDismiss, setCanAutoDismiss] = useState(false)
  const waitingForAuditRef = useRef(false)

  const sheet = getActiveSheet()
  const cellCount = Object.keys(sheet.cells).length

  const hasCriticalIssues = lastAuditResult?.findings?.some(
    (f) => f.severity === 'critical' || f.severity === 'high',
  ) ?? false

  const criticalFindings = useMemo(() => {
    const findings = lastAuditResult?.findings ?? []
    return findings
      .filter((f) => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 3)
  }, [lastAuditResult])

  // Detect when a new import happens via custom event from importOrchestration
  useEffect(() => {
    const handler = () => {
      if (dismissed) return
      waitingForAuditRef.current = true
      setCanAutoDismiss(false)
      setImportSeq((n) => n + 1)
      setVisible(true)
      setDismissed(false)
    }
    document.addEventListener('smartsht:import-complete', handler)
    return () => document.removeEventListener('smartsht:import-complete', handler)
  }, [dismissed])

  // Arm auto-dismiss only after audit for this import, or after grace if audit never arrives.
  // Do not trust lastAuditResult that existed before import-complete (stale prior file).
  useEffect(() => {
    if (!visible || importSeq === 0) return
    waitingForAuditRef.current = true
    setCanAutoDismiss(false)
    const grace = setTimeout(() => {
      if (!waitingForAuditRef.current) return
      waitingForAuditRef.current = false
      setCanAutoDismiss(true)
    }, AUDIT_GRACE_MS)
    return () => clearTimeout(grace)
  }, [visible, importSeq])

  // When audit result updates while waiting, settle early (audit path ~500ms).
  // Only react to lastAuditResult changes — do not settle on the stale pre-import result.
  useEffect(() => {
    if (!waitingForAuditRef.current) return
    waitingForAuditRef.current = false
    const critical = lastAuditResult?.findings?.some(
      (f) => f.severity === 'critical' || f.severity === 'high',
    ) ?? false
    setCanAutoDismiss(!critical)
  }, [lastAuditResult])

  // Never auto-dismiss while critical/high findings are present
  useEffect(() => {
    if (hasCriticalIssues) setCanAutoDismiss(false)
  }, [hasCriticalIssues])

  // Auto-dismiss timer — only after audit/grace, and never with critical findings
  useEffect(() => {
    if (!visible || !canAutoDismiss || hasCriticalIssues) return
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [visible, canAutoDismiss, hasCriticalIssues])

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
          borderColor: hasCriticalIssues ? 'var(--danger, #dc2626)' : 'var(--neutral-200)',
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

        {/* Audit findings callout — surface critical titles without requiring chat */}
        {auditIssueCount > 0 && (
          <button
            type="button"
            onClick={handleOpenAuditor}
            className="w-full px-4 py-2.5 border-b flex flex-col gap-1.5 transition-colors hover:bg-amber-50/50 text-left"
            style={{ borderColor: 'var(--neutral-100)' }}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className={hasCriticalIssues ? 'text-red-500' : 'text-amber-500'} />
                <span className={`text-xs font-medium ${hasCriticalIssues ? 'text-red-700' : 'text-amber-700'}`}>
                  {auditIssueCount} issue{auditIssueCount === 1 ? '' : 's'} found
                  {hasCriticalIssues ? ' (critical)' : ''}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--accent-600)' }}>
                <span>Open Auditor</span>
                <ChevronRight size={10} />
              </div>
            </div>
            {criticalFindings.length > 0 && (
              <ul className="pl-5 list-disc space-y-0.5">
                {criticalFindings.map((f) => (
                  <li key={f.id} className="text-[11px] text-red-700/90 line-clamp-1">
                    {f.title}
                  </li>
                ))}
              </ul>
            )}
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
            {hasCriticalIssues
              ? 'Stays open until dismissed'
              : canAutoDismiss
                ? 'Auto-dismisses in 30s'
                : 'Checking for issues…'}
          </span>
        </div>
      </div>
    </div>
  )
}

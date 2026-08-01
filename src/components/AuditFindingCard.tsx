import { useState } from 'react'
import { ChevronRight, ChevronDown, Wrench, ExternalLink } from 'lucide-react'
import type { AuditFinding } from '@/auditor/types'
import { AuditBadge } from './AuditBadge'

interface AuditFindingCardProps {
  finding: AuditFinding
  onCellNavigate?: (row: number, col: number) => void
  onFix?: (finding: AuditFinding) => void
}

export function AuditFindingCard({ finding, onCellNavigate, onFix }: AuditFindingCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-xl border hover:shadow-md transition-all duration-200 overflow-hidden group"
      style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)' }}
    >
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="mt-1 shrink-0 transition-colors" style={{ color: 'var(--neutral-400)' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AuditBadge severity={finding.severity} />
          </div>
          <span className="text-xs font-semibold leading-snug block" style={{ color: 'var(--ink-primary)' }}>
            {finding.title}
          </span>
        </div>

        {finding.autoFixable && (
          <span
            className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wider"
            style={{ borderColor: 'oklch(0.85 0.1 155)', color: 'oklch(0.4 0.12 155)', background: 'var(--success-soft)' }}
            title="Auto-fixable"
          >
            <Wrench size={10} className="inline -mt-0.5 mr-1" />
            Fix
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 space-y-3 border-t" style={{ borderColor: 'var(--neutral-100)', background: 'var(--neutral-50)' }}>
          <p className="text-[11px] leading-relaxed mt-3 px-1" style={{ color: 'var(--ink-secondary)' }}>
            {finding.message}
          </p>

          {finding.suggestion && (
            <div className="text-[11px] border-l-4 rounded-r-lg px-3 py-2" style={{ color: 'var(--accent-700)', background: 'var(--accent-50)', borderColor: 'var(--accent-500)' }}>
              <span className="font-semibold block mb-0.5">Recommendation:</span>
              {finding.suggestion}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1 px-1">
            <span className="text-[9px] font-bold uppercase tracking-widest w-full mb-1" style={{ color: 'var(--ink-muted)' }}>Affected Cells</span>
            {finding.cells.map((cell) => (
              <button
                key={cell.cellId}
                type="button"
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono font-medium rounded-lg border transition-all"
                style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onCellNavigate?.(cell.row, cell.col)
                }}
                title={`Go to ${cell.cellId}`}
              >
                {cell.cellId}
                <ExternalLink size={9} style={{ color: 'var(--neutral-400)' }} />
              </button>
            ))}

            {finding.autoFixable && onFix && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg text-white transition-all active:scale-95"
                style={{ background: 'var(--success)', boxShadow: 'var(--shadow-sm)' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onFix(finding)
                }}
              >
                <Wrench size={10} />
                APPLY FIX
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

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
      className="rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 bg-white overflow-hidden group"
    >
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-slate-50/50"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="mt-1 text-gray-400 shrink-0 group-hover:text-blue-500 transition-colors">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AuditBadge severity={finding.severity} />
          </div>
          <span className="text-xs font-semibold text-slate-800 leading-snug block">
            {finding.title}
          </span>
        </div>

        {finding.autoFixable && (
          <span
            className="shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 uppercase tracking-wider"
            title="Auto-fixable"
          >
            <Wrench size={10} className="inline -mt-0.5 mr-1" />
            Fix
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-0 space-y-3 border-t border-slate-100 bg-slate-50/30">
          <p className="text-[11px] text-slate-600 leading-relaxed mt-3 px-1">
            {finding.message}
          </p>

          {finding.suggestion && (
            <div className="text-[11px] text-blue-700 bg-blue-50/80 border-l-4 border-blue-500 rounded-r-lg px-3 py-2 shadow-sm">
              <span className="font-semibold block mb-0.5">Recommendation:</span>
              {finding.suggestion}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1 px-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest w-full mb-1">Affected Cells</span>
            {finding.cells.map((cell) => (
              <button
                key={cell.cellId}
                type="button"
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all shadow-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onCellNavigate?.(cell.row, cell.col)
                }}
                title={`Go to ${cell.cellId}`}
              >
                {cell.cellId}
                <ExternalLink size={9} className="text-slate-400" />
              </button>
            ))}

            {finding.autoFixable && onFix && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
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

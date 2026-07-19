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
      className="rounded-lg border border-gray-200 hover:border-blue-200 transition-colors bg-white"
    >
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="mt-0.5 text-gray-400 shrink-0">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <AuditBadge severity={finding.severity} />
            <span className="text-xs font-medium text-gray-700 truncate">
              {finding.title}
            </span>
          </div>
        </div>

        {finding.autoFixable && (
          <span
            className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border border-emerald-300 text-emerald-600 bg-emerald-50"
            title="Auto-fixable"
          >
            <Wrench size={10} className="inline -mt-px mr-0.5" />
            Fix
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-gray-100 ml-6">
          <p className="text-[11px] text-gray-500 leading-relaxed mt-2">
            {finding.message}
          </p>

          {finding.suggestion && (
            <div className="text-[11px] text-blue-600 bg-blue-50 border-l-2 border-blue-400 rounded-r px-2 py-1.5">
              💡 {finding.suggestion}
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            {finding.cells.map((cell) => (
              <button
                key={cell.cellId}
                type="button"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded border border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  onCellNavigate?.(cell.row, cell.col)
                }}
                title={`Go to ${cell.cellId}`}
              >
                {cell.cellId}
                <ExternalLink size={8} className="text-gray-400" />
              </button>
            ))}

            {finding.autoFixable && onFix && (
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  onFix(finding)
                }}
              >
                <Wrench size={9} />
                Apply Fix
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

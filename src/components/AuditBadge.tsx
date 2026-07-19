import type { Severity } from '@/auditor/types'

const BADGE_CONFIG: Record<Severity, { classes: string; label: string }> = {
  critical: { classes: 'bg-red-600 text-white', label: 'Critical' },
  high: { classes: 'bg-orange-500 text-white', label: 'High' },
  medium: { classes: 'bg-amber-500 text-white', label: 'Medium' },
  low: { classes: 'bg-blue-500 text-white', label: 'Low' },
  info: { classes: 'bg-gray-400 text-white', label: 'Info' },
}

interface AuditBadgeProps {
  severity: Severity
  className?: string
}

export function AuditBadge({ severity, className = '' }: AuditBadgeProps) {
  const config = BADGE_CONFIG[severity]

  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide leading-tight ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  )
}

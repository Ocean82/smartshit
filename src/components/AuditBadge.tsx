import { AlertCircle, AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react'
import type { Severity } from '@/auditor/types'

const BADGE_CONFIG: Record<Severity, { classes: string; label: string; icon: React.ReactNode }> = {
  critical: {
    classes: 'bg-red-50 text-red-700 border-red-200',
    label: 'Critical',
    icon: <ShieldAlert size={10} />,
  },
  high: {
    classes: 'bg-orange-50 text-orange-700 border-orange-200',
    label: 'High',
    icon: <AlertCircle size={10} />,
  },
  medium: {
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'Medium',
    icon: <AlertTriangle size={10} />,
  },
  low: {
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'Low',
    icon: <Info size={10} />,
  },
  info: {
    classes: 'bg-slate-50 text-slate-600 border-slate-200',
    label: 'Info',
    icon: <CheckCircle2 size={10} />,
  },
}

interface AuditBadgeProps {
  severity: Severity
  className?: string
}

export function AuditBadge({ severity, className = '' }: AuditBadgeProps) {
  const config = BADGE_CONFIG[severity]

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide leading-tight ${config.classes} ${className}`}
    >
      {config.icon}
      {config.label}
    </span>
  )
}

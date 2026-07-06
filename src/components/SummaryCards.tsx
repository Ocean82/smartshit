import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react'

interface BudgetMetric {
  label: string
  value: number
  formatted: string
}

function parseNumeric(value: string): number | null {
  const cleaned = value.replace(/[$,%\s]/g, '')
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function findMetricByLabel(
  cells: Record<string, { value?: string | number | boolean | null; formula?: string }>,
  getComputed: (row: number, col: number) => string,
  patterns: string[],
): BudgetMetric | null {
  for (const [cellId, cell] of Object.entries(cells)) {
    const label = String(cell.value ?? '').toLowerCase()
    if (!patterns.some((p) => label.includes(p))) continue

    const ref = cellToRef(cellId)
    const valueCell = refToCell(ref.row, ref.col + 1)
    const raw = getComputed(cellToRef(valueCell).row, cellToRef(valueCell).col)
    const num = parseNumeric(raw)
    if (num == null) continue

    return {
      label: String(cell.value),
      value: num,
      formatted: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(num),
    }
  }
  return null
}

export function SummaryCards() {
  const { getActiveSheet, getComputedValue } = useStore()
  const sheet = getActiveSheet()

  const metrics = useMemo(() => {
    const getComputed = (row: number, col: number) => getComputedValue(row, col)

    const income =
      findMetricByLabel(sheet.cells, getComputed, ['total income', 'income']) ??
      findMetricByLabel(sheet.cells, getComputed, ['revenue', 'gross'])

    const expenses =
      findMetricByLabel(sheet.cells, getComputed, ['total expense', 'total expenses']) ??
      findMetricByLabel(sheet.cells, getComputed, ['expenses'])

    const net =
      findMetricByLabel(sheet.cells, getComputed, ['net savings', 'net balance', 'net']) ??
      (income && expenses
        ? {
            label: 'Net',
            value: income.value - expenses.value,
            formatted: new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            }).format(income.value - expenses.value),
          }
        : null)

    const cellCount = Object.keys(sheet.cells).length
    return { income, expenses, net, cellCount }
  }, [sheet.cells, getComputedValue])

  if (metrics.cellCount < 4) {
    return (
      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-gray-200">
        <p className="text-sm text-gray-600">
          Tell the assistant what you want to track — try{' '}
          <span className="font-medium text-blue-700">&quot;Build a monthly budget&quot;</span>{' '}
          or pick a template below.
        </p>
      </div>
    )
  }

  const cards = [
    {
      icon: TrendingUp,
      label: 'Income',
      metric: metrics.income,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      icon: TrendingDown,
      label: 'Expenses',
      metric: metrics.expenses,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
    },
    {
      icon: PiggyBank,
      label: 'Net',
      metric: metrics.net,
      color: metrics.net && metrics.net.value >= 0 ? 'text-blue-600' : 'text-amber-600',
      bg: metrics.net && metrics.net.value >= 0 ? 'bg-blue-50' : 'bg-amber-50',
    },
  ]

  return (
    <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <Wallet size={14} className="text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          At a glance
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {cards.map(({ icon: Icon, label, metric, color, bg }) => (
          <div key={label} className={`rounded-xl ${bg} px-3 py-2.5 border border-white/80`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className={color} />
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {label}
              </span>
            </div>
            <p className={`text-lg font-bold ${color}`}>
              {metric ? metric.formatted : '—'}
            </p>
            {metric && (
              <p className="text-[10px] text-gray-500 truncate">{metric.label}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

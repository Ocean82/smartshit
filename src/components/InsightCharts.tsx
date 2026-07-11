/**
 * InsightCharts — Auto-generated spending visualizations.
 *
 * Renders inline SVG charts (no external dependencies) based on
 * the sheet's computed insights. Shows:
 * - Spending by category (horizontal bar chart)
 * - Income vs Expenses gauge
 *
 * Only renders when meaningful budget data is detected.
 */

import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { computeSheetInsights } from '@/ai/sheetInsights'

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

export function InsightCharts() {
  const { getActiveSheet, getComputedValue } = useStore()
  const sheet = getActiveSheet()

  const insights = useMemo(() => {
    return computeSheetInsights(sheet, getComputedValue)
  }, [sheet, getComputedValue])

  // Only show if we have meaningful budget data
  const hasCategories = (insights.categoryTotals?.length ?? 0) >= 2
  const hasIncomeExpense = (insights.totalIncome ?? 0) > 0 || (insights.totalExpenses ?? 0) > 0

  if (!hasCategories && !hasIncomeExpense) return null

  return (
    <div className="flex gap-3 px-3 py-2 border-b border-gray-100 overflow-x-auto bg-gray-50/50">
      {hasCategories && <CategoryBarChart categories={insights.categoryTotals ?? []} />}
      {hasIncomeExpense && (
        <IncomeExpenseGauge
          income={insights.totalIncome ?? 0}
          expenses={insights.totalExpenses ?? 0}
        />
      )}
    </div>
  )
}

function CategoryBarChart({ categories }: { categories: Array<{ category: string; total: number }> }) {
  const sorted = [...categories].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 6)
  const maxVal = Math.max(...sorted.map((c) => Math.abs(c.total)), 1)

  return (
    <div className="shrink-0 bg-white rounded-lg border border-gray-200 p-3 min-w-[260px]">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Spending by Category
      </div>
      <div className="space-y-1.5">
        {sorted.map((cat, i) => {
          const pct = Math.abs(cat.total) / maxVal
          return (
            <div key={cat.category} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-600 w-20 truncate" title={cat.category}>
                {cat.category}
              </span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
              </div>
              <span className="text-[10px] font-medium text-gray-700 w-14 text-right">
                ${Math.abs(cat.total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IncomeExpenseGauge({ income, expenses }: { income: number; expenses: number }) {
  const net = income - expenses
  const total = income + expenses
  const incomePct = total > 0 ? (income / total) * 100 : 50
  const isPositive = net >= 0

  return (
    <div className="shrink-0 bg-white rounded-lg border border-gray-200 p-3 min-w-[180px]">
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Income vs Expenses
      </div>
      <div className="flex items-center gap-3">
        {/* Simple stacked bar */}
        <div className="flex-1">
          <div className="h-6 bg-gray-100 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${incomePct}%` }}
            />
            <div
              className="h-full bg-red-400 transition-all duration-500"
              style={{ width: `${100 - incomePct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-green-600">${income.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className="text-[9px] text-red-500">${expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        {/* Net indicator */}
        <div className="text-center">
          <div className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}${net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[9px] text-gray-400">net</div>
        </div>
      </div>
    </div>
  )
}

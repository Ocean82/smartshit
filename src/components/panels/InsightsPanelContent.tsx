/**
 * InsightsPanelContent — The Insights panel content for the DockPanel system.
 *
 * Combines the KPI summary cards + category charts + income vs expenses gauge
 * into a single scrollable panel. Replaces the inline SummaryCards + InsightCharts
 * that previously lived inside the spreadsheet grid area.
 */

import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { computeSheetInsights } from '@/ai/sheetInsights'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { TrendingUp, TrendingDown, PiggyBank, AlertTriangle, BarChart3 } from 'lucide-react'

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function InsightsPanelContent() {
  const { getActiveSheet, getComputedValue } = useStore()
  const sheet = getActiveSheet()

  const insights = useMemo(() => {
    return computeSheetInsights(sheet, getComputedValue)
  }, [sheet, getComputedValue])

  const profile = useMemo(() => {
    return buildSheetProfile(sheet, getComputedValue)
  }, [sheet, getComputedValue])

  const cellCount = Object.keys(sheet.cells).length

  if (cellCount < 3) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <BarChart3 size={32} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500 mb-1">No data to analyze yet</p>
        <p className="text-xs text-gray-400">
          Import a spreadsheet or create data from a template to see insights here.
        </p>
      </div>
    )
  }

  const hasCategories = (insights.categoryTotals?.length ?? 0) >= 2
  const hasIncomeExpense = (insights.totalIncome ?? 0) > 0 || (insights.totalExpenses ?? 0) > 0
  const hasOutliers = (insights.outliers?.length ?? 0) > 0

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Sheet purpose */}
      <div className="px-3 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-700">{sheet.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
            {profile.detectedPurpose}
          </span>
        </div>
        <p className="text-[11px] text-gray-500">
          {profile.rowCount} rows × {profile.colCount} columns · {cellCount} cells
        </p>
      </div>

      {/* KPI Cards */}
      {hasIncomeExpense && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="grid grid-cols-1 gap-2">
            {insights.totalIncome != null && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2.5 border border-emerald-100">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <TrendingUp size={12} className="text-emerald-600" />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Income</span>
                </div>
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(insights.totalIncome)}</p>
              </div>
            )}
            {insights.totalExpenses != null && (
              <div className="rounded-lg bg-rose-50 px-3 py-2.5 border border-rose-100">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <TrendingDown size={12} className="text-rose-600" />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Expenses</span>
                </div>
                <p className="text-lg font-bold text-rose-700">{formatCurrency(insights.totalExpenses)}</p>
              </div>
            )}
            {insights.netCashflow != null && (
              <div className={`rounded-lg px-3 py-2.5 border ${
                insights.netCashflow >= 0
                  ? 'bg-blue-50 border-blue-100'
                  : 'bg-amber-50 border-amber-100'
              }`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <PiggyBank size={12} className={insights.netCashflow >= 0 ? 'text-blue-600' : 'text-amber-600'} />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Net</span>
                </div>
                <p className={`text-lg font-bold ${insights.netCashflow >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                  {formatCurrency(insights.netCashflow)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Income vs Expenses bar */}
      {hasIncomeExpense && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Income vs Expenses
          </div>
          <IncomeExpenseBar
            income={insights.totalIncome ?? 0}
            expenses={insights.totalExpenses ?? 0}
          />
        </div>
      )}

      {/* Spending by category */}
      {hasCategories && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Spending by Category
          </div>
          <CategoryBars categories={insights.categoryTotals ?? []} />
        </div>
      )}

      {/* Top expenses */}
      {insights.topExpenses && insights.topExpenses.length > 0 && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Top Expenses
          </div>
          <div className="space-y-1">
            {insights.topExpenses.slice(0, 8).map((expense, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate mr-2">{expense.label}</span>
                <span className="font-medium text-gray-800 shrink-0">{formatCurrency(expense.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Over-budget items */}
      {insights.negativeVariances && insights.negativeVariances.length > 0 && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={11} className="text-amber-500" />
            <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
              Over Budget ({insights.negativeVariances.length})
            </span>
          </div>
          <div className="space-y-1">
            {insights.negativeVariances.slice(0, 6).map((v, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate mr-2">{v.label}</span>
                <span className="font-medium text-red-600 shrink-0">{formatCurrency(v.difference)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outliers */}
      {hasOutliers && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Unusual Values ({insights.outliers!.length})
          </div>
          <div className="space-y-1">
            {insights.outliers!.slice(0, 5).map((o, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">
                  {o.cellRef || `${o.columnLetter}${o.row}`}
                  {o.column && <span className="text-gray-400 ml-1">({o.column})</span>}
                </span>
                <span className="font-medium text-amber-700 shrink-0">{formatCurrency(o.value)}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            These values are statistically far from their column average. Verify they're correct.
          </p>
        </div>
      )}

      {/* Column stats summary */}
      {insights.columnStats.length > 0 && (
        <div className="px-3 py-3">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Column Summary
          </div>
          <div className="space-y-1.5">
            {insights.columnStats.slice(0, 8).map((col) => (
              <div key={col.column} className="text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">{col.label}</span>
                  <span className="text-gray-400 text-[10px]">{col.count} values</span>
                </div>
                {col.sum != null && (
                  <div className="flex gap-3 text-[10px] text-gray-500 mt-0.5">
                    <span>Sum: {formatCurrency(col.sum)}</span>
                    {col.average != null && <span>Avg: {formatCurrency(col.average)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IncomeExpenseBar({ income, expenses }: { income: number; expenses: number }) {
  const total = income + expenses
  const incomePct = total > 0 ? (income / total) * 100 : 50
  const net = income - expenses

  return (
    <div>
      <div className="h-5 bg-gray-100 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${incomePct}%` }}
        />
        <div
          className="h-full bg-rose-400 transition-all duration-500"
          style={{ width: `${100 - incomePct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-emerald-600">{formatCurrency(income)}</span>
        <span className={`text-[10px] font-medium ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          Net: {formatCurrency(net)}
        </span>
        <span className="text-[10px] text-rose-500">{formatCurrency(expenses)}</span>
      </div>
    </div>
  )
}

function CategoryBars({ categories }: { categories: Array<{ category: string; total: number }> }) {
  const sorted = [...categories].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 8)
  const maxVal = Math.max(...sorted.map((c) => Math.abs(c.total)), 1)

  return (
    <div className="space-y-1.5">
      {sorted.map((cat, i) => {
        const pct = Math.abs(cat.total) / maxVal
        return (
          <div key={cat.category} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600 w-20 truncate" title={cat.category}>
              {cat.category}
            </span>
            <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
            </div>
            <span className="text-[10px] font-medium text-gray-700 w-14 text-right">
              {formatCurrency(Math.abs(cat.total))}
            </span>
          </div>
        )
      })}
    </div>
  )
}

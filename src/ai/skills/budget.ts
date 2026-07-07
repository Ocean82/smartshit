import type { SheetInsights } from '@/ai/sheetInsights'
import type { BudgetAnalysis, SheetProfile, ToolResult } from '@/ai/types'

export function analyzeBudget(
  profile: SheetProfile,
  insights: SheetInsights,
): BudgetAnalysis {
  const overspendingCategories = (insights.negativeVariances ?? []).map((v) => ({
    category: v.label,
    amount: Math.abs(v.difference),
  }))

  if (overspendingCategories.length === 0 && insights.topExpenses?.length) {
    for (const expense of insights.topExpenses.slice(0, 3)) {
      overspendingCategories.push({ category: expense.label, amount: expense.amount })
    }
  }

  const monthlyIncome = insights.totalIncome
  const monthlyExpenses = insights.totalExpenses
  let savingsRate: number | undefined
  let recommendation503020: BudgetAnalysis['recommendation503020']

  if (monthlyIncome && monthlyIncome > 0) {
    const expenses = monthlyExpenses ?? 0
    savingsRate = ((monthlyIncome - expenses) / monthlyIncome) * 100
    recommendation503020 = {
      needs: monthlyIncome * 0.5,
      wants: monthlyIncome * 0.3,
      savings: monthlyIncome * 0.2,
    }
  }

  const parts: string[] = []
  if (overspendingCategories.length > 0) {
    parts.push(
      `Top spending areas: ${overspendingCategories.map((c) => `${c.category} ($${c.amount.toFixed(2)})`).join(', ')}`,
    )
  }
  if (monthlyExpenses !== undefined) parts.push(`Total expenses: $${monthlyExpenses.toFixed(2)}`)
  if (monthlyIncome !== undefined) parts.push(`Total income: $${monthlyIncome.toFixed(2)}`)
  if (insights.netCashflow !== undefined) {
    parts.push(`Net cashflow: $${insights.netCashflow.toFixed(2)}`)
  }

  return {
    overspendingCategories,
    savingsRate,
    monthlyIncome,
    monthlyExpenses,
    recommendation503020,
    summary: parts.join('. ') || `Analyzed sheet "${profile.name}" (${profile.detectedPurpose}).`,
  }
}

export function savingsRecommendation(
  monthlyIncome: number,
  insights: SheetInsights,
): ToolResult {
  const expenses = insights.totalExpenses ?? 0
  const leftover = monthlyIncome - expenses
  const targetSavings = monthlyIncome * 0.2
  const gap = targetSavings - Math.max(leftover, 0)
  const split = {
    needs: monthlyIncome * 0.5,
    wants: monthlyIncome * 0.3,
    savings: monthlyIncome * 0.2,
  }

  const splitLine = `50/30/20 guide: Needs $${split.needs.toFixed(0)}, Wants $${split.wants.toFixed(0)}, Savings $${split.savings.toFixed(0)}.`

  const message = leftover >= targetSavings
    ? `On $${monthlyIncome.toLocaleString()}/month with $${expenses.toLocaleString()} expenses, you have $${leftover.toLocaleString()} left — you're meeting the 20% savings target ($${targetSavings.toFixed(0)}). ${splitLine}`
    : `On $${monthlyIncome.toLocaleString()}/month with $${expenses.toLocaleString()} expenses, aim to save $${targetSavings.toFixed(0)}/month (20%). Cut about $${gap.toFixed(0)} from spending. ${splitLine}`

  return {
    success: true,
    message,
    toolUsed: 'budget',
    suggestions: insights.topExpenses?.slice(0, 3).map((e) => `Review ${e.label}: $${e.amount}`) ?? [],
    data: { monthlyIncome, expenses, targetSavings, leftover, recommendation503020: split },
  }
}

export function budgetAnalysisToToolResult(analysis: BudgetAnalysis): ToolResult {
  return {
    success: true,
    message: analysis.summary,
    data: analysis,
    toolUsed: 'budget',
    suggestions: analysis.overspendingCategories.map(
      (c) => `Look at ${c.category} — $${c.amount.toFixed(2)}`,
    ),
  }
}

import type { SheetInsights } from '@/ai/sheetInsights'
import type { BudgetAnalysis, SheetProfile, ToolResult } from '@/ai/types'

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

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
  const assumptions: string[] = []

  if (monthlyIncome && monthlyIncome > 0) {
    const expenses = monthlyExpenses ?? 0
    savingsRate = ((monthlyIncome - expenses) / monthlyIncome) * 100
    recommendation503020 = {
      needs: monthlyIncome * 0.5,
      wants: monthlyIncome * 0.3,
      savings: monthlyIncome * 0.2,
    }
  } else {
    assumptions.push('No clear income column detected; savings-rate guidance may be conservative.')
  }

  const parts: string[] = []
  if (overspendingCategories.length > 0) {
    parts.push(
      `Top spending areas: ${overspendingCategories.map((c) => `${c.category} (${formatCurrency(c.amount)})`).join(', ')}`,
    )
  }
  if (monthlyExpenses !== undefined) parts.push(`Total expenses: ${formatCurrency(monthlyExpenses)}`)
  if (monthlyIncome !== undefined) parts.push(`Total income: ${formatCurrency(monthlyIncome)}`)
  if (insights.netCashflow !== undefined) {
    parts.push(`Net cashflow: ${formatCurrency(insights.netCashflow)}`)
  }
  if (savingsRate !== undefined) {
    parts.push(`Current savings rate: ${savingsRate.toFixed(1)}%`)
  }
  if (assumptions.length > 0) {
    parts.push(`Assumptions: ${assumptions.join(' ')}`)
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

  const splitLine = `50/30/20 guide: Needs ${formatCurrency(split.needs)}, Wants ${formatCurrency(split.wants)}, Savings ${formatCurrency(split.savings)}.`

  const message = leftover >= targetSavings
    ? `On ${formatCurrency(monthlyIncome)}/month with ${formatCurrency(expenses)} expenses, you have ${formatCurrency(leftover)} left — you're meeting the 20% savings target (${formatCurrency(targetSavings)}). ${splitLine}`
    : `On ${formatCurrency(monthlyIncome)}/month with ${formatCurrency(expenses)} expenses, aim to save ${formatCurrency(targetSavings)}/month (20%). Reduce spending by about ${formatCurrency(gap)}. ${splitLine}`

  return {
    success: true,
    message,
    toolUsed: 'budget',
    suggestions: insights.topExpenses?.slice(0, 3).map((e) => `Review ${e.label}: ${formatCurrency(e.amount)}`) ?? [],
    data: { monthlyIncome, expenses, targetSavings, leftover, recommendation503020: split },
  }
}

export function budgetAnalysisToToolResult(analysis: BudgetAnalysis): ToolResult {
  const topSuggestions = analysis.overspendingCategories
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  return {
    success: true,
    message: analysis.summary,
    data: analysis,
    toolUsed: 'budget',
    suggestions: topSuggestions.map(
      (c) => `Look at ${c.category} — ${formatCurrency(c.amount)}`,
    ),
  }
}

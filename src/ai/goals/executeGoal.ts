import type { GoalAction, GoalExecution, GoalMatch, GoalOutput } from './types'
import type { SheetProfile } from '@/ai/types'
import { columnDataRange, formatAmount } from './columnRange'

export function executeGoal(
  match: GoalMatch,
  profile?: SheetProfile | null,
): GoalExecution {
  if (match.status !== 'matched' || !match.goal || !match.output) {
    return {
      actions: [],
      message: match.question ?? (match.explain || 'I could not run that goal.'),
      explain: match.explain,
    }
  }

  const output = match.output
  const executor = executors[match.goal.id]?.[output]
  if (!executor) {
    return {
      actions: [],
      message: `No ${output} implementation for ${match.goal.title}.`,
      explain: match.explain,
    }
  }

  const result = executor(match, profile ?? null)
  return {
    ...result,
    explain: match.explain,
    message: `${result.message}\n\n${match.explain}`,
  }
}

type ExecutorFn = (
  match: GoalMatch,
  profile: SheetProfile | null,
) => { actions: GoalAction[]; message: string }

function chartAction(
  type: 'pie' | 'bar',
  title: string,
  labelCol: string,
  valueCol: string,
  valueLabel: string,
  profile: SheetProfile | null,
): { actions: GoalAction[]; message: string } {
  const labels = columnDataRange(profile, labelCol)
  const values = columnDataRange(profile, valueCol)
  if (!labels || !values) {
    return {
      actions: [],
      message: `I need more rows in ${labelCol} and ${valueCol} before I can chart ${title}.`,
    }
  }
  return {
    actions: [{
      tool: 'create_chart',
      params: {
        type,
        title,
        dataRange: labels,
        series: [{ label: valueLabel, dataRange: values }],
      },
      description: title,
    }],
    message: `Creating ${title} from ${labelCol} and ${valueCol}.`,
  }
}

const executors: Record<string, Partial<Record<GoalOutput, ExecutorFn>>> = {
  total: {
    formula: (match) => {
      const col = match.slots.amountColumn!
      return {
        actions: [{
          tool: 'apply_formula',
          params: { cell: col, formula: '=SUM' },
          description: `Sum column ${col}`,
        }],
        message: `Adding a SUM formula for column ${col}.`,
      }
    },
    summary: (match, profile) => {
      const col = match.slots.amountColumn!
      const amount = profile?.columns.find((c) => c.column === col)
      const formatted = formatAmount(amount?.sumVal)
      return {
        actions: [],
        message: formatted
          ? `Total of ${amount?.name ?? col}: ${formatted}`
          : `I can total column ${col}. Ask me to add a formula if you want it on the sheet.`,
      }
    },
  },
  by_category: {
    chart: (match, profile) => chartAction(
      'pie',
      'By Category',
      match.slots.categoryColumn!,
      match.slots.amountColumn!,
      'Amount',
      profile,
    ),
    summary: (match) => ({
      actions: [],
      message: `I can group ${match.slots.amountColumn} by ${match.slots.categoryColumn}. Ask for a chart or name a category for a SUMIF.`,
    }),
    formula: (match) => {
      const amt = match.slots.amountColumn!
      const cat = match.slots.categoryColumn!
      const value = match.slots.categoryValue
      if (!value) {
        return {
          actions: [],
          message: `Name a category to write SUMIF, or ask for a By Category chart.`,
        }
      }
      const formula = `=SUMIF(${cat}:${cat},${JSON.stringify(value)},${amt}:${amt})`
      return {
        actions: [{
          tool: 'apply_formula',
          params: { cell: amt, formula },
          description: `SUMIF ${value} in ${cat}`,
        }],
        message: `Adding ${formula} for ${value}.`,
      }
    },
  },
  by_month: {
    chart: (match, profile) => chartAction(
      'bar',
      'By Month',
      match.slots.dateColumn!,
      match.slots.amountColumn!,
      'Amount',
      profile,
    ),
    summary: (match) => ({
      actions: [],
      message: `I can total ${match.slots.amountColumn} by month using date column ${match.slots.dateColumn}. Ask for a chart to put it on the sheet.`,
    }),
    formula: () => ({
      actions: [],
      message: 'A monthly split is a chart, not a single SUM. Ask for a By Month chart.',
    }),
  },
}

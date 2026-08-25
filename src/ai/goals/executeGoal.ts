import type { GoalAction, GoalExecution, GoalMatch, GoalOutput } from './types'

export function executeGoal(match: GoalMatch): GoalExecution {
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

  const result = executor(match)
  return {
    ...result,
    explain: match.explain,
    message: `${result.message}\n\n${match.explain}`,
  }
}

type ExecutorFn = (match: GoalMatch) => { actions: GoalAction[]; message: string }

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
    summary: (match) => ({
      actions: [],
      message: `I can total column ${match.slots.amountColumn}. Ask me to add a formula if you want it on the sheet.`,
    }),
  },
  by_category: {
    chart: (match) => {
      const cat = match.slots.categoryColumn!
      const amt = match.slots.amountColumn!
      return {
        actions: [{
          tool: 'create_chart',
          params: {
            type: 'pie',
            dataRange: `${cat}:${amt}`,
            title: 'By Category',
          },
          description: 'Chart totals by category',
        }],
        message: `Creating a category breakdown chart from ${cat} and ${amt}.`,
      }
    },
    summary: (match) => ({
      actions: [],
      message: `I can group ${match.slots.amountColumn} by ${match.slots.categoryColumn}. Ask for a chart or name a category for a SUMIF.`,
    }),
    formula: (match) => {
      const amt = match.slots.amountColumn!
      const cat = match.slots.categoryColumn!
      const value = match.slots.categoryValue
      if (value) {
        const formula = `=SUMIF(${cat}:${cat},${JSON.stringify(value)},${amt}:${amt})`
        return {
          actions: [{
            tool: 'apply_formula',
            params: { cell: amt, formula },
            description: `SUMIF ${value} in ${cat}`,
          }],
          message: `Adding ${formula} for ${value}.`,
        }
      }
      return {
        actions: [{
          tool: 'apply_formula',
          params: { cell: amt, formula: '=SUM' },
          description: `Sum column ${amt}`,
        }],
        message: `No category filter given, so I am totaling ${amt}. Name a category to use SUMIF.`,
      }
    },
  },
  by_month: {
    chart: (match) => {
      const date = match.slots.dateColumn!
      const amt = match.slots.amountColumn!
      return {
        actions: [{
          tool: 'create_chart',
          params: {
            type: 'bar',
            dataRange: `${date}:${amt}`,
            title: 'By Month',
          },
          description: 'Chart totals by month',
        }],
        message: `Creating a monthly trend chart from ${date} and ${amt}.`,
      }
    },
    summary: (match) => ({
      actions: [],
      message: `I can total ${match.slots.amountColumn} by month using date column ${match.slots.dateColumn}. Ask for a chart to put it on the sheet.`,
    }),
    formula: (match) => {
      const amt = match.slots.amountColumn!
      return {
        actions: [{
          tool: 'apply_formula',
          params: { cell: amt, formula: '=SUM' },
          description: `Sum column ${amt}`,
        }],
        message: `Monthly splits need a chart or a date filter. Adding a total on ${amt} for now.`,
      }
    },
  },
}

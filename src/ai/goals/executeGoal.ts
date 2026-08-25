import type { GoalAction, GoalExecution, GoalMatch, GoalOutput } from './types'
import type { SheetProfile } from '@/ai/types'
import type { ChartSnapshot, SheetData } from '@/types'
import { columnDataRange, formatAmount } from './columnRange'
import { letterToCol } from '@/lib/cellRef'
import { getColumnDataRows } from '@/lib/sheetRows'

// ─── Goal Context ─────────────────────────────────────────────────────────────

/** Provides live computed values and sheet access for aggregation. Threaded from the pipeline. */
export interface GoalContext {
  getComputedValue: (row: number, col: number) => string
  sheet: SheetData
}

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

/**
 * Group by category column, sum by amount column.
 * Uses getComputedValue so formula results are respected.
 * Skips summary rows via getColumnDataRows.
 */
function aggregateByCategory(
  ctx: GoalContext,
  categoryCol: string,
  amountCol: string,
): ChartSnapshot | null {
  const catIdx = letterToCol(categoryCol)
  const amtIdx = letterToCol(amountCol)

  const bounds = getColumnDataRows(ctx.sheet, amtIdx, ctx.getComputedValue)
  if (!bounds) return null

  const groups = new Map<string, number>()

  for (let r = bounds.firstRow; r <= bounds.lastRow; r++) {
    if (bounds.excludedRows.has(r)) continue
    const category = ctx.getComputedValue(r, catIdx).trim()
    if (!category) continue
    const raw = ctx.getComputedValue(r, amtIdx)
    const value = parseFloat(raw.replace(/[,$\s]/g, '')) || 0
    groups.set(category, (groups.get(category) ?? 0) + value)
  }

  if (groups.size === 0) return null

  // Sort descending by value for pie readability
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1])

  return {
    labels: sorted.map(([label]) => label),
    series: [{ label: 'Amount', values: sorted.map(([, val]) => val) }],
  }
}

/**
 * Bucket by YYYY-MM from date column, sum by amount column.
 * Uses getComputedValue so formula results and formatted dates are respected.
 * Skips summary rows via getColumnDataRows.
 */
function aggregateByMonth(
  ctx: GoalContext,
  dateCol: string,
  amountCol: string,
): ChartSnapshot | null {
  const dateIdx = letterToCol(dateCol)
  const amtIdx = letterToCol(amountCol)

  const bounds = getColumnDataRows(ctx.sheet, amtIdx, ctx.getComputedValue)
  if (!bounds) return null

  const months = new Map<string, number>()

  for (let r = bounds.firstRow; r <= bounds.lastRow; r++) {
    if (bounds.excludedRows.has(r)) continue
    const dateStr = ctx.getComputedValue(r, dateIdx).trim()
    if (!dateStr) continue

    const bucket = parseMonthBucket(dateStr)
    if (!bucket) continue

    const raw = ctx.getComputedValue(r, amtIdx)
    const value = parseFloat(raw.replace(/[,$\s]/g, '')) || 0
    months.set(bucket, (months.get(bucket) ?? 0) + value)
  }

  if (months.size === 0) return null

  // Sort chronologically
  const sorted = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return {
    labels: sorted.map(([label]) => label),
    series: [{ label: 'Amount', values: sorted.map(([, val]) => val) }],
  }
}

/** Try to parse a date string into a YYYY-MM bucket. */
function parseMonthBucket(dateStr: string): string | null {
  // Try native Date parse first
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
  // Try MM/DD/YYYY or DD/MM/YYYY patterns
  const slashMatch = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (slashMatch) {
    const [, a, , c] = slashMatch
    const year = c.length === 2 ? 2000 + parseInt(c) : parseInt(c)
    // Assume first number is month (US format)
    const month = String(parseInt(a)).padStart(2, '0')
    return `${year}-${month}`
  }
  return null
}

// ─── Execute Goal ─────────────────────────────────────────────────────────────

export function executeGoal(
  match: GoalMatch,
  profile?: SheetProfile | null,
  ctx?: GoalContext | null,
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

  const result = executor(match, profile ?? null, ctx ?? null)
  return {
    ...result,
    explain: match.explain,
    message: `${result.message}\n\n${match.explain}`,
  }
}

type ExecutorFn = (
  match: GoalMatch,
  profile: SheetProfile | null,
  ctx: GoalContext | null,
) => { actions: GoalAction[]; message: string }

function snapshotChartAction(
  type: 'pie' | 'bar',
  title: string,
  snapshot: ChartSnapshot | null,
  labelCol: string,
  valueCol: string,
): { actions: GoalAction[]; message: string } {
  if (!snapshot) {
    return {
      actions: [],
      message: `I need more rows in ${labelCol} and ${valueCol} before I can chart ${title}.`,
    }
  }
  return {
    actions: [{
      tool: 'create_chart',
      params: { type, title, snapshot },
      description: title,
    }],
    message: `Creating ${title} — grouped ${snapshot.labels.length} categories from ${labelCol} and ${valueCol}.`,
  }
}

/**
 * Fallback for when no GoalContext is available (shouldn't happen in normal flow,
 * but keeps backward compat if executeGoal is called without context).
 */
function legacyChartAction(
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
    summary: (match, profile, ctx) => {
      const col = match.slots.amountColumn!
      // Prefer live computed total when GoalContext is available
      if (ctx) {
        const colIdx = letterToCol(col)
        const bounds = getColumnDataRows(ctx.sheet, colIdx, ctx.getComputedValue)
        if (bounds) {
          let total = 0
          for (let r = bounds.firstRow; r <= bounds.lastRow; r++) {
            if (bounds.excludedRows.has(r)) continue
            const raw = ctx.getComputedValue(r, colIdx)
            total += parseFloat(raw.replace(/[,$\s]/g, '')) || 0
          }
          const formatted = formatAmount(total)
          if (formatted) {
            const colName = profile?.columns.find((c) => c.column === col)?.name ?? col
            return {
              actions: [],
              message: `Total of ${colName}: ${formatted}`,
            }
          }
        }
      }
      // Fallback to profile.sumVal
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
    chart: (match, profile, ctx) => {
      const catCol = match.slots.categoryColumn!
      const amtCol = match.slots.amountColumn!
      if (ctx) {
        const snapshot = aggregateByCategory(ctx, catCol, amtCol)
        return snapshotChartAction('pie', 'By Category', snapshot, catCol, amtCol)
      }
      return legacyChartAction('pie', 'By Category', catCol, amtCol, 'Amount', profile)
    },
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
    chart: (match, profile, ctx) => {
      const dateCol = match.slots.dateColumn!
      const amtCol = match.slots.amountColumn!
      if (ctx) {
        const snapshot = aggregateByMonth(ctx, dateCol, amtCol)
        return snapshotChartAction('bar', 'By Month', snapshot, dateCol, amtCol)
      }
      return legacyChartAction('bar', 'By Month', dateCol, amtCol, 'Amount', profile)
    },
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

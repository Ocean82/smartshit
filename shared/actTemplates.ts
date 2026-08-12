import type { ActTemplateResult } from './intentTypes.js'
import { FONT_COLOR_HEX, HIGHLIGHT_BG_HEX } from './colorMaps.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_COLUMN = 'B'
const DEFAULT_COUNT_COLUMN = 'A'
const DEFAULT_PERCENT = 10
const DEFAULT_HIGHLIGHT_BG = '#FFF9C4'
const NEGATIVE_HIGHLIGHT_BG = '#FEE2E2'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractColumn(input: string, defaultCol: string = DEFAULT_COLUMN): string {
  const match = input.match(/column\s+([a-z])/i)
  return match ? match[1].toUpperCase() : defaultCol
}

function extractPercent(input: string, defaultPct: number = DEFAULT_PERCENT): number {
  const match = input.match(/(\d+)\s*%/)
  return match ? parseInt(match[1]) : defaultPct
}

function matchesAny(input: string, keywords: string[]): boolean {
  return keywords.some((kw) => input.includes(kw))
}

function extractColorWord(input: string): string | undefined {
  return input.match(/\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/)?.[1]
}

// ─── Formatting sub-resolver ─────────────────────────────────────────────────

function resolveFormattingTemplate(lower: string, colorWord: string | undefined): ActTemplateResult | null {
  const bgColor = (colorWord && HIGHLIGHT_BG_HEX[colorWord]) || DEFAULT_HIGHLIGHT_BG

  // Highlight negatives
  if (lower.includes('negative')) {
    return {
      message: 'I will highlight negative values in red. Click Apply to confirm.',
      actions: [{ tool: 'format_cells', params: { condition: { operator: 'negative' }, bgColor: NEGATIVE_HIGHLIGHT_BG }, description: 'Highlight negative values' }],
    }
  }

  // Highlight cells equal to a value
  const equalsMatch = lower.match(/equals?(\s+to)?\s*\$?([\d,.]+)/)
  if (equalsMatch) {
    const value = parseFloat(equalsMatch[2].replace(/,/g, ''))
    return {
      message: `I will highlight cells equal to ${value}. Click Apply to confirm.`,
      actions: [{ tool: 'format_cells', params: { condition: { operator: 'eq', value }, bgColor }, description: `Highlight cells equal to ${value}` }],
    }
  }

  // Highlight cells containing a value
  const containsMatch = lower.match(/(?:contain(?:ing|s)?|with|having)\s+(?:the\s+)?(?:number\s+|value\s+|text\s+)?["']?([\w.$-]+)["']?/)
  if (containsMatch) {
    const value = containsMatch[1]
    return {
      message: `I will highlight cells containing "${value}". Click Apply to confirm.`,
      actions: [{ tool: 'format_cells', params: { condition: { operator: 'contains', value }, bgColor }, description: `Highlight cells containing ${value}` }],
    }
  }

  // Change font/text color
  if (colorWord && FONT_COLOR_HEX[colorWord] && /\b(text|font|writing)\b/.test(lower)) {
    return {
      message: `I will change the text color to ${colorWord}. Click Apply to confirm.`,
      actions: [{ tool: 'format_cells', params: { fontColor: FONT_COLOR_HEX[colorWord] }, description: `Change text color to ${colorWord}` }],
    }
  }

  // Generic formatting: bold / highlight / color background
  const params: Record<string, unknown> = {}
  if (lower.includes('bold')) params.bold = true
  if (lower.includes('highlight')) params.bgColor = bgColor
  else if (colorWord && HIGHLIGHT_BG_HEX[colorWord]) params.bgColor = HIGHLIGHT_BG_HEX[colorWord]

  if (Object.keys(params).length === 0) {
    // "format this nicely" with no concrete style — let the LLM decide
    return { message: '', actions: [] }
  }

  return {
    message: 'I will format the selected cells. Click Apply to confirm.',
    actions: [{ tool: 'format_cells', params, description: 'Format selected cells' }],
  }
}

// ─── Rule definitions ────────────────────────────────────────────────────────

interface TemplateRule {
  id: string
  match: (lower: string) => boolean
  resolve: (lower: string) => ActTemplateResult
}

const RULES: TemplateRule[] = [
  // Destructive actions — must match first
  {
    id: 'clear_sheet',
    match: (l) => matchesAny(l, ['clear', 'reset', 'start over', 'blank']),
    resolve: () => ({
      message: 'This will clear all data on the current sheet. Click Apply to confirm.',
      actions: [{ tool: 'clear_sheet', params: {}, description: 'Clear current sheet' }],
    }),
  },

  // Template generators
  {
    id: 'expense_report',
    match: (l) => l.includes('expense report') || (l.includes('expense') && l.includes('report')),
    resolve: () => ({
      message: 'I will generate an expense report template with categories, amounts, and approval fields.',
      actions: [{ tool: 'create_expense_report', params: {}, description: 'Create expense report template' }],
    }),
  },
  {
    id: 'kpi_dashboard',
    match: (l) => matchesAny(l, ['kpi', 'dashboard', 'metrics']),
    resolve: () => ({
      message: 'I will create a KPI dashboard with key metrics, targets, and status tracking.',
      actions: [{ tool: 'create_kpi_dashboard', params: {}, description: 'Create KPI dashboard template' }],
    }),
  },
  {
    id: 'clean_data',
    match: (l) => matchesAny(l, ['clean', 'dedupe', 'trim whitespace']),
    resolve: () => ({
      message: 'I will clean whitespace and normalize headers on the current sheet. Review the preview, then click Apply.',
      actions: [{ tool: 'clean_sheet_data', params: {}, description: 'Clean sheet data' }],
    }),
  },
  {
    id: 'budget',
    match: (l) => matchesAny(l, ['budget', 'expense', 'spending', 'spend']) || (l.includes('track') && matchesAny(l, ['money', 'cost'])),
    resolve: () => ({
      message: 'I will build a monthly budget with income, fixed expenses, variable expenses, and automatic totals. Review the preview, then click Apply.',
      actions: [{ tool: 'create_budget_template', params: {}, description: 'Create monthly budget template' }],
    }),
  },
  {
    id: 'sales_tracker',
    match: (l) => matchesAny(l, ['sales', 'inventory', 'stock', 'revenue']),
    resolve: () => ({
      message: 'I will set up a sales and inventory tracker with products, quantities, prices, and revenue formulas.',
      actions: [{ tool: 'create_sales_tracker', params: {}, description: 'Create sales tracker' }],
    }),
  },
  {
    id: 'invoice',
    match: (l) => matchesAny(l, ['invoice', 'bill', 'billing']),
    resolve: () => ({
      message: 'I will generate an invoice template with line items, tax, and total calculations.',
      actions: [{ tool: 'create_invoice', params: {}, description: 'Create invoice template' }],
    }),
  },
  {
    id: 'project_tracker',
    match: (l) => matchesAny(l, ['project', 'timeline', 'schedule', 'tasks', 'todo', 'to-do']),
    resolve: () => ({
      message: 'I will create a project tracker with tasks, dates, assignees, and status columns.',
      actions: [{ tool: 'create_project_tracker', params: {}, description: 'Create project tracker' }],
    }),
  },
  {
    id: 'employee_roster',
    match: (l) => matchesAny(l, ['employee', 'roster', 'team', 'staff', 'hr', 'payroll']),
    resolve: () => ({
      message: 'I will build an employee roster with roles, contact info, and departments.',
      actions: [{ tool: 'create_employee_roster', params: {}, description: 'Create employee roster' }],
    }),
  },

  // Charts
  {
    id: 'chart',
    match: (l) => matchesAny(l, ['chart', 'graph', 'visuali']),
    resolve: (l) => {
      const chartType = l.includes('pie') ? 'pie' : l.includes('line') ? 'line' : l.includes('scatter') ? 'scatter' : 'bar'
      return {
        message: `I will create a ${chartType} chart from your sheet data.`,
        actions: [{ tool: 'create_chart', params: { type: chartType }, description: `Create ${chartType} chart` }],
      }
    },
  },

  // Formulas
  {
    id: 'sum',
    match: (l) => matchesAny(l, ['sum', 'total', 'add up']),
    resolve: (l) => {
      const col = extractColumn(l)
      return {
        message: `I will add a SUM formula for column ${col}.`,
        actions: [{ tool: 'apply_formula', params: { column: col, formula: 'SUM' }, description: `Sum column ${col}` }],
      }
    },
  },
  {
    id: 'average',
    match: (l) => matchesAny(l, ['average', 'avg', 'mean']),
    resolve: (l) => {
      const col = extractColumn(l)
      return {
        message: `I will add an AVERAGE formula for column ${col}.`,
        actions: [{ tool: 'apply_formula', params: { column: col, formula: 'AVERAGE' }, description: `Average column ${col}` }],
      }
    },
  },
  {
    id: 'count',
    match: (l) => l.includes('count') && !l.includes('discount'),
    resolve: (l) => {
      const col = extractColumn(l, DEFAULT_COUNT_COLUMN)
      return {
        message: `I will count the entries in column ${col}.`,
        actions: [{ tool: 'apply_formula', params: { column: col, formula: 'COUNT' }, description: `Count column ${col}` }],
      }
    },
  },
  {
    id: 'max',
    match: (l) => matchesAny(l, ['max', 'highest', 'largest']),
    resolve: (l) => {
      const col = extractColumn(l)
      return {
        message: `I will find the maximum value in column ${col}.`,
        actions: [{ tool: 'apply_formula', params: { column: col, formula: 'MAX' }, description: `Max of column ${col}` }],
      }
    },
  },
  {
    id: 'min',
    match: (l) => matchesAny(l, ['min', 'lowest', 'smallest']),
    resolve: (l) => {
      const col = extractColumn(l)
      return {
        message: `I will find the minimum value in column ${col}.`,
        actions: [{ tool: 'apply_formula', params: { column: col, formula: 'MIN' }, description: `Min of column ${col}` }],
      }
    },
  },

  // Percentage increase
  {
    id: 'percent_increase',
    match: (l) => !!l.match(/(\d+)\s*%/) && matchesAny(l, ['add', 'increase', 'raise', 'markup']),
    resolve: (l) => {
      const pct = extractPercent(l)
      const col = extractColumn(l)
      return {
        message: `I will increase all values in column ${col} by ${pct}%.`,
        actions: [{ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 + pct / 100 }, description: `Add ${pct}% to column ${col}` }],
      }
    },
  },

  // Percentage decrease
  {
    id: 'percent_decrease',
    match: (l) => !!l.match(/(\d+)\s*%/) && matchesAny(l, ['reduce', 'decrease', 'discount', 'subtract']),
    resolve: (l) => {
      const pct = extractPercent(l)
      const col = extractColumn(l)
      return {
        message: `I will decrease all values in column ${col} by ${pct}%.`,
        actions: [{ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 - pct / 100 }, description: `Reduce column ${col} by ${pct}%` }],
      }
    },
  },

  // Double values
  {
    id: 'double',
    match: (l) => matchesAny(l, ['double', 'multiply by 2', 'times 2']),
    resolve: (l) => {
      const col = extractColumn(l)
      return {
        message: `I will double all values in column ${col}.`,
        actions: [{ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 2 }, description: `Double column ${col}` }],
      }
    },
  },

  // Formatting (delegates to sub-resolver)
  {
    id: 'formatting',
    match: (l) => {
      const colorWord = extractColorWord(l)
      return l.includes('bold') || l.includes('format') || l.includes('highlight') || l.includes('colour') || l.includes('color')
        || (colorWord != null && /\b(text|font|cells?|writing)\b/.test(l))
    },
    resolve: (l) => {
      const colorWord = extractColorWord(l)
      return resolveFormattingTemplate(l, colorWord) ?? { message: '', actions: [] }
    },
  },
]

// ─── Public API ──────────────────────────────────────────────────────────────

export function resolveActTemplates(message: string): ActTemplateResult {
  const lower = message.toLowerCase().trim()

  for (const rule of RULES) {
    if (rule.match(lower)) return rule.resolve(lower)
  }

  return { message: '', actions: [] }
}

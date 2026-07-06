import type { AgentActionInput } from './prompt.js'

export function resolveIntent(message: string): {
  message: string
  actions: AgentActionInput[]
} {
  const lower = message.toLowerCase().trim()

  if (lower.includes('budget') || lower.includes('expense') || lower.includes('spending') || lower.includes('spend') || (lower.includes('track') && (lower.includes('money') || lower.includes('cost')))) {
    return {
      message: 'I will build a monthly budget with income, fixed expenses, variable expenses, and automatic totals. Review the preview, then click Apply.',
      actions: [{ tool: 'create_budget_template', params: {}, description: 'Create monthly budget template' }],
    }
  }

  if (lower.includes('sales') || lower.includes('inventory') || lower.includes('stock') || lower.includes('revenue')) {
    return {
      message: 'I will set up a sales and inventory tracker with products, quantities, prices, and revenue formulas.',
      actions: [{ tool: 'create_sales_tracker', params: {}, description: 'Create sales tracker' }],
    }
  }

  if (lower.includes('invoice') || lower.includes('bill') || lower.includes('billing')) {
    return {
      message: 'I will generate an invoice template with line items, tax, and total calculations.',
      actions: [{ tool: 'create_invoice', params: {}, description: 'Create invoice template' }],
    }
  }

  if (lower.includes('project') || lower.includes('timeline') || lower.includes('schedule') || lower.includes('tasks')) {
    return {
      message: 'I will create a project tracker with tasks, dates, assignees, and status columns.',
      actions: [{ tool: 'create_project_tracker', params: {}, description: 'Create project tracker' }],
    }
  }

  if (lower.includes('employee') || lower.includes('roster') || lower.includes('team') || lower.includes('staff')) {
    return {
      message: 'I will build an employee roster with roles, contact info, and departments.',
      actions: [{ tool: 'create_employee_roster', params: {}, description: 'Create employee roster' }],
    }
  }

  if (lower.includes('chart') || lower.includes('graph')) {
    const chartType = lower.includes('pie') ? 'pie' : lower.includes('line') ? 'line' : 'bar'
    return {
      message: `I will create a ${chartType} chart from your sheet data.`,
      actions: [{ tool: 'create_chart', params: { type: chartType }, description: `Create ${chartType} chart` }],
    }
  }

  if (lower.includes('sum') || lower.includes('total')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will add a SUM formula for column ${col}.`,
      actions: [{ tool: 'apply_formula', params: { column: col, formula: 'SUM' }, description: `Sum column ${col}` }],
    }
  }

  if (lower.includes('analyze') || lower.includes('explain')) {
    return {
      message: 'Here is a plain-English summary of your sheet based on the current data.',
      actions: [{ tool: 'analyze_data', params: {}, description: 'Analyze sheet data' }],
    }
  }

  if (lower.includes('hello') || lower.includes('hi') || lower === 'hey') {
    return {
      message: 'Hi! I can build budgets, track expenses, create invoices, and explain your spreadsheet in plain English. Try: "Build a monthly budget" or "Track my business expenses".',
      actions: [],
    }
  }

  if (lower.includes('help') || lower.includes('what can you do')) {
    return {
      message: 'I can help you:\n- Build a monthly budget\n- Track sales or inventory\n- Create invoices\n- Plan projects\n- Add formulas and charts\n\nDescribe what you need in everyday language, then click Apply on any suggested changes.',
      actions: [],
    }
  }

  if (lower.includes('clear') || lower.includes('reset')) {
    return {
      message: 'This will clear all data on the current sheet. Click Apply to confirm.',
      actions: [{ tool: 'clear_sheet', params: {}, description: 'Clear current sheet' }],
    }
  }

  return {
    message: '',
    actions: [],
  }
}

export function isWeakResponse(message: string, actions: AgentActionInput[]): boolean {
  const text = message.trim()
  if (actions.length > 0) return false
  if (!text || text === 'Done.' || text === 'Done') return true
  if (text.length < 12) return true
  return false
}

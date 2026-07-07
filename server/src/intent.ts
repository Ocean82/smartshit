import type { AgentActionInput } from './prompt.js'

export function resolveIntent(message: string): {
  message: string
  actions: AgentActionInput[]
} {
  const lower = message.toLowerCase().trim()

  // ─── Template creation intents ──────────────────────────────────────────────

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

  if (lower.includes('project') || lower.includes('timeline') || lower.includes('schedule') || lower.includes('tasks') || lower.includes('todo') || lower.includes('to-do')) {
    return {
      message: 'I will create a project tracker with tasks, dates, assignees, and status columns.',
      actions: [{ tool: 'create_project_tracker', params: {}, description: 'Create project tracker' }],
    }
  }

  if (lower.includes('employee') || lower.includes('roster') || lower.includes('team') || lower.includes('staff') || lower.includes('hr') || lower.includes('payroll')) {
    return {
      message: 'I will build an employee roster with roles, contact info, and departments.',
      actions: [{ tool: 'create_employee_roster', params: {}, description: 'Create employee roster' }],
    }
  }

  // ─── Chart intents ────────────────────────────────────────────────────────────

  if (lower.includes('chart') || lower.includes('graph') || lower.includes('visuali')) {
    const chartType = lower.includes('pie') ? 'pie' : lower.includes('line') ? 'line' : lower.includes('scatter') ? 'scatter' : 'bar'
    return {
      message: `I will create a ${chartType} chart from your sheet data.`,
      actions: [{ tool: 'create_chart', params: { type: chartType }, description: `Create ${chartType} chart` }],
    }
  }

  // ─── Formula intents ──────────────────────────────────────────────────────────

  if (lower.includes('sum') || lower.includes('total') || lower.includes('add up')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will add a SUM formula for column ${col}.`,
      actions: [{ tool: 'apply_formula', params: { column: col, formula: 'SUM' }, description: `Sum column ${col}` }],
    }
  }

  if (lower.includes('average') || lower.includes('avg') || lower.includes('mean')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will add an AVERAGE formula for column ${col}.`,
      actions: [{ tool: 'apply_formula', params: { column: col, formula: 'AVERAGE' }, description: `Average column ${col}` }],
    }
  }

  if (lower.includes('count') && !lower.includes('discount')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'A'
    return {
      message: `I will count the entries in column ${col}.`,
      actions: [{ tool: 'apply_formula', params: { column: col, formula: 'COUNT' }, description: `Count column ${col}` }],
    }
  }

  if (lower.includes('max') || lower.includes('highest') || lower.includes('largest')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will find the maximum value in column ${col}.`,
      actions: [{ tool: 'apply_formula', params: { column: col, formula: 'MAX' }, description: `Max of column ${col}` }],
    }
  }

  if (lower.includes('min') || lower.includes('lowest') || lower.includes('smallest')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will find the minimum value in column ${col}.`,
      actions: [{ tool: 'apply_formula', params: { column: col, formula: 'MIN' }, description: `Min of column ${col}` }],
    }
  }

  // ─── Column modification intents ──────────────────────────────────────────────

  if (lower.match(/(\d+)\s*%/) && (lower.includes('add') || lower.includes('increase') || lower.includes('raise') || lower.includes('markup'))) {
    const pctMatch = lower.match(/(\d+)\s*%/)
    const pct = pctMatch ? parseInt(pctMatch[1]) : 10
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will increase all values in column ${col} by ${pct}%.`,
      actions: [{ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 + pct / 100 }, description: `Add ${pct}% to column ${col}` }],
    }
  }

  if (lower.match(/(\d+)\s*%/) && (lower.includes('reduce') || lower.includes('decrease') || lower.includes('discount') || lower.includes('subtract'))) {
    const pctMatch = lower.match(/(\d+)\s*%/)
    const pct = pctMatch ? parseInt(pctMatch[1]) : 10
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will decrease all values in column ${col} by ${pct}%.`,
      actions: [{ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 1 - pct / 100 }, description: `Reduce column ${col} by ${pct}%` }],
    }
  }

  if (lower.includes('double') || lower.includes('multiply by 2') || lower.includes('times 2')) {
    const colMatch = lower.match(/column\s+([a-z])/i)
    const col = colMatch ? colMatch[1].toUpperCase() : 'B'
    return {
      message: `I will double all values in column ${col}.`,
      actions: [{ tool: 'modify_column', params: { column: col, operation: 'multiply', factor: 2 }, description: `Double column ${col}` }],
    }
  }

  // ─── Format intents ───────────────────────────────────────────────────────────

  if (lower.includes('bold') || lower.includes('format') || lower.includes('highlight') || lower.includes('color')) {
    return {
      message: 'I will format the selected cells. Click Apply to confirm.',
      actions: [{ tool: 'format_cells', params: { bold: lower.includes('bold'), bgColor: lower.includes('highlight') || lower.includes('color') ? '#FFF9C4' : undefined }, description: 'Format selected cells' }],
    }
  }

  // ─── Analysis intents ─────────────────────────────────────────────────────────

  if (lower.includes('analyze') || lower.includes('explain') || lower.includes('summarize') || lower.includes('summary') || lower.includes('what does') || lower.includes('describe')) {
    return {
      message: 'Here is a plain-English summary of your sheet based on the current data.',
      actions: [{ tool: 'analyze_data', params: {}, description: 'Analyze sheet data' }],
    }
  }

  // ─── Clear / reset ────────────────────────────────────────────────────────────

  if (lower.includes('clear') || lower.includes('reset') || lower.includes('start over') || lower.includes('blank')) {
    return {
      message: 'This will clear all data on the current sheet. Click Apply to confirm.',
      actions: [{ tool: 'clear_sheet', params: {}, description: 'Clear current sheet' }],
    }
  }

  // ─── Greeting & help ──────────────────────────────────────────────────────────

  if (lower.includes('hello') || lower.includes('hi') || lower === 'hey' || lower === 'yo' || lower.includes('good morning') || lower.includes('good evening')) {
    return {
      message: 'Hi! I can build budgets, track expenses, create invoices, and explain your spreadsheet in plain English. Try: "Build a monthly budget" or "Track my business expenses".',
      actions: [],
    }
  }

  if (lower.includes('help') || lower.includes('what can you do') || lower.includes('how do i') || lower.includes('what do you')) {
    return {
      message: 'I can help you:\n- Build a monthly budget\n- Track sales or inventory\n- Create invoices\n- Plan projects\n- Manage employee rosters\n- Add formulas (SUM, AVERAGE, MAX, MIN, COUNT)\n- Create charts (bar, line, pie)\n- Format cells (bold, highlight)\n- Increase/decrease column values by %\n\nDescribe what you need in everyday language, then click Apply on any suggested changes.',
      actions: [],
    }
  }

  if (lower.includes('thank') || lower.includes('thanks') || lower.includes('awesome') || lower.includes('great') || lower.includes('perfect') || lower.includes('nice')) {
    return {
      message: 'You\'re welcome! Let me know if there\'s anything else I can help with.',
      actions: [],
    }
  }

  // ─── No match — fall through to LLM ──────────────────────────────────────────
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

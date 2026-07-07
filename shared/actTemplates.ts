import type { ActTemplateResult } from './intentTypes.js'

export function resolveActTemplates(message: string): ActTemplateResult {
  const lower = message.toLowerCase().trim()

  if (lower.includes('expense report') || (lower.includes('expense') && lower.includes('report'))) {
    return {
      message: 'I will generate an expense report template with categories, amounts, and approval fields.',
      actions: [{ tool: 'create_expense_report', params: {}, description: 'Create expense report template' }],
    }
  }

  if (lower.includes('kpi') || lower.includes('dashboard') || lower.includes('metrics')) {
    return {
      message: 'I will create a KPI dashboard with key metrics, targets, and status tracking.',
      actions: [{ tool: 'create_kpi_dashboard', params: {}, description: 'Create KPI dashboard template' }],
    }
  }

  if (lower.includes('clean') || lower.includes('dedupe') || lower.includes('trim whitespace')) {
    return {
      message: 'I will clean whitespace and normalize headers on the current sheet. Review the preview, then click Apply.',
      actions: [{ tool: 'clean_sheet_data', params: {}, description: 'Clean sheet data' }],
    }
  }

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

  if (lower.includes('chart') || lower.includes('graph') || lower.includes('visuali')) {
    const chartType = lower.includes('pie') ? 'pie' : lower.includes('line') ? 'line' : lower.includes('scatter') ? 'scatter' : 'bar'
    return {
      message: `I will create a ${chartType} chart from your sheet data.`,
      actions: [{ tool: 'create_chart', params: { type: chartType }, description: `Create ${chartType} chart` }],
    }
  }

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

  if (lower.includes('bold') || lower.includes('format') || lower.includes('highlight') || lower.includes('color')) {
    return {
      message: 'I will format the selected cells. Click Apply to confirm.',
      actions: [{ tool: 'format_cells', params: { bold: lower.includes('bold'), bgColor: lower.includes('highlight') || lower.includes('color') ? '#FFF9C4' : undefined }, description: 'Format selected cells' }],
    }
  }

  if (lower.includes('clear') || lower.includes('reset') || lower.includes('start over') || lower.includes('blank')) {
    return {
      message: 'This will clear all data on the current sheet. Click Apply to confirm.',
      actions: [{ tool: 'clear_sheet', params: {}, description: 'Clear current sheet' }],
    }
  }

  return { message: '', actions: [] }
}

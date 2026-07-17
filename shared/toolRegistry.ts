/**
 * Canonical tool registry — single source of truth for AI spreadsheet tools.
 *
 * Consumed by:
 * - Client fast path: `src/agent/executor.ts` (executes mutate tools directly)
 * - Client LLM path: `src/store/useStore.ts` executeAction (delegates to executor)
 * - Server: `server/src/parseResponse.ts` (allowlist) and `server/src/prompt.ts` (tool docs)
 *
 * Categories:
 * - mutate:   changes sheet cells/structure; handled by the unified executor
 * - read:     answers questions; never mutates the sheet
 * - template: builds a full sheet layout; executed by the store's template switch
 */

import type { ToolDefinition } from './toolTypes.js'

/** [name, description] pairs for the niche gallery templates (specs in src/templates). */
const NICHE_TEMPLATES: Array<[string, string]> = [
  ['create_wedding_budget', 'Track wedding expenses by category with vendor payments and deposits'],
  ['create_student_loan_payoff', 'Track multiple student loans with payoff dates and interest calculations'],
  ['create_retirement_calculator', 'Calculate retirement savings needed based on current age and goals'],
  ['create_emergency_fund', 'Track progress toward your emergency fund goal with monthly contributions'],
  ['create_debt_snowball', 'Track debts smallest to largest with payoff dates and interest saved'],
  ['create_savings_goal', 'Track progress toward any savings goal with monthly contributions'],
  ['create_net_worth_tracker', 'Track assets vs liabilities to calculate and monitor net worth over time'],
  ['create_holiday_budget', 'Track gift spending by person with budget limits and totals'],
  ['create_travel_budget', 'Plan and track trip expenses including flights, hotels, food, and activities'],
  ['create_baby_budget', 'Track baby-related expenses including nursery, gear, diapers, and healthcare'],
  ['create_college_savings', 'Track 529 plan or college savings with projected growth over time'],
  ['create_freelancer_invoice', 'Professional invoice template with hourly rates and project breakdown'],
  ['create_quarterly_tax', 'Estimate quarterly tax payments based on income and deductions'],
  ['create_mileage_tracker', 'Track business miles with dates, destinations, and purpose for tax deductions'],
  ['create_client_tracker', 'Track client projects, invoices, and payments in one place'],
  ['create_hourly_timesheet', 'Track hourly work by project with daily and weekly totals'],
  ['create_project_quote', 'Create professional project quotes with line items and totals'],
  ['create_income_expense_log', 'Track all business income and expenses with categories'],
  ['create_equipment_depreciation', 'Track business equipment with purchase dates and depreciation schedules'],
  ['create_profit_margin', 'Calculate profit margins for products or services'],
  ['create_freelancer_dashboard', 'Overview of income, expenses, and outstanding invoices'],
  ['create_rental_property', 'Track rental income, expenses, and occupancy for investment properties'],
  ['create_mortgage_calculator', 'Calculate monthly payments, interest, and amortization schedules'],
  ['create_airbnb_income', 'Track short-term rental income, expenses, and occupancy rates'],
  ['create_property_comparison', 'Compare multiple properties side by side with key metrics'],
  ['create_rent_roll', 'Track tenant rent payments and balances for multi-unit properties'],
  ['create_lease_tracker', 'Track lease terms, expiration dates, and renewal status'],
  ['create_renovation_budget', 'Track renovation costs by room with contractor payments'],
  ['create_roi_calculator', 'Calculate return on investment for property purchases'],
  ['create_pnl_statement', 'Track revenue, costs, and profit over a reporting period'],
  ['create_cash_flow', 'Project cash inflows and outflows to avoid shortfalls'],
  ['create_inventory_tracker', 'Track stock levels, reorder points, and inventory value'],
  ['create_payroll_sheet', 'Track employee hours, wages, deductions, and net pay'],
  ['create_accounts_receivable', 'Track outstanding customer invoices and payment status'],
  ['create_accounts_payable', 'Track vendor bills and payment due dates'],
  ['create_break_even', 'Calculate break-even point for products or services'],
  ['create_unit_economics', 'Track CAC, LTV, and other per-unit financial metrics'],
  ['create_startup_costs', 'Track initial business expenses and funding sources'],
  ['create_gpa_calculator', 'Calculate GPA by semester with credit hours and grades'],
  ['create_class_schedule', 'Organize classes by day and time with room numbers and professors'],
  ['create_student_gradebook', 'Track student grades by assignment type with weighted averages'],
  ['create_assignment_tracker', 'Track assignments with due dates, status, and grades'],
  ['create_scholarship_tracker', 'Track scholarship applications, deadlines, and award amounts'],
  ['create_workout_log', 'Track exercises, sets, reps, and weights over time'],
  ['create_meal_planner', 'Plan weekly meals with calories and grocery list'],
  ['create_weight_tracker', 'Track weight over time with daily or weekly measurements'],
  ['create_habit_tracker', 'Track daily habits with streaks and completion rates'],
  ['create_medical_expenses', 'Track healthcare costs including insurance, prescriptions, and visits'],
]

export const TOOL_REGISTRY: ToolDefinition[] = [
  // ─── Formatting (canonical + aliases) ─────────────────────────────────────
  {
    name: 'format_cells',
    category: 'mutate',
    description:
      'Format cells: bold, background color, font color, font size. Optional "range" (e.g. "A1:D1", "B", "B2:B10"); defaults to selection or populated cells. Optional "condition" targets cells by value.',
    params: [
      { name: 'range', type: 'string', description: 'A1-style range, column letter, or single cell. Omit to use selection/whole sheet.' },
      { name: 'bold', type: 'boolean', description: 'Make text bold' },
      { name: 'italic', type: 'boolean', description: 'Make text italic' },
      { name: 'fontSize', type: 'number', description: 'Font size in px' },
      { name: 'bgColor', type: 'string', description: 'Background color hex, e.g. "#FFF9C4"' },
      { name: 'fontColor', type: 'string', description: 'Font color hex, e.g. "#FF0000"' },
      {
        name: 'condition',
        type: 'object',
        description:
          'Only format matching cells: {operator: "eq"|"lt"|"gt"|"lte"|"gte"|"contains"|"negative"|"positive", value?: string|number}',
      },
    ],
    examples: [
      'highlight cells containing 4',
      'change the text to red',
      'bold the headers',
      'highlight negative values in red',
    ],
  },
  {
    name: 'format_range',
    category: 'mutate',
    aliasFor: 'format_cells',
    description: 'Legacy alias for format_cells.',
    params: [
      { name: 'range', type: 'string', description: 'Range like A1:D1 or A for full column', required: true },
      { name: 'bold', type: 'boolean', description: 'Make bold' },
      { name: 'bgColor', type: 'string', description: 'Background color hex' },
      { name: 'fontColor', type: 'string', description: 'Font color hex' },
      { name: 'fontSize', type: 'number', description: 'Font size in px' },
    ],
    examples: ['bold the headers', 'highlight row 1 in blue'],
  },
  {
    name: 'conditional_format',
    category: 'mutate',
    aliasFor: 'format_cells',
    description: 'Legacy alias for format_cells with a column + condition.',
    params: [
      { name: 'column', type: 'string', description: 'Column to evaluate', required: true },
      { name: 'condition', type: 'string', description: 'gt, lt, eq, negative, positive', required: true },
      { name: 'value', type: 'number', description: 'Threshold value' },
      { name: 'color', type: 'string', description: 'Highlight color hex' },
    ],
    examples: ['highlight negatives in red', 'color expenses over 500 orange'],
  },
  // ─── Cell operations ──────────────────────────────────────────────────────
  {
    name: 'set_cell',
    category: 'mutate',
    description: 'Write a value or formula to a specific cell',
    params: [
      { name: 'cell', type: 'string', description: 'Cell reference like A1, B3', required: true },
      { name: 'value', type: 'string', description: 'Value or formula (formulas start with =)', required: true },
    ],
    examples: ['put 500 in B3', 'set A1 to Total', 'write =SUM(B1:B10) in B11'],
  },
  {
    name: 'set_range',
    category: 'mutate',
    description: 'Fill a range of cells with values',
    params: [
      { name: 'startCell', type: 'string', description: 'Top-left cell of range', required: true },
      { name: 'values', type: 'array', description: 'Array of arrays (rows) of values', required: true },
    ],
    examples: ['fill A1:A12 with months', 'put headers Name, Amount, Date in row 1'],
  },
  {
    name: 'add_row',
    category: 'mutate',
    description: 'Add a new row of data at the end of existing data or after a specific row',
    params: [
      { name: 'values', type: 'array', description: 'Array of values for the row', required: true },
      { name: 'afterRow', type: 'number', description: 'Insert after this row (0-indexed). Omit to append.' },
    ],
    examples: ['add a row: Groceries, $400', 'add Netflix, $15, Entertainment'],
  },
  {
    name: 'delete_row',
    category: 'mutate',
    description: 'Delete a row by row number or by matching content',
    params: [
      { name: 'row', type: 'number', description: 'Row number (1-indexed)' },
      { name: 'match', type: 'string', description: 'Delete the row containing this text' },
    ],
    examples: ['delete row 5', 'remove the Netflix row'],
  },
  {
    name: 'rename_header',
    category: 'mutate',
    description: 'Rename a column header',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
      { name: 'newName', type: 'string', description: 'New header text', required: true },
    ],
    examples: ['rename column B to Actual Spending', 'change header C to Status'],
  },
  {
    name: 'apply_formula',
    category: 'mutate',
    description: 'Apply a formula to a cell or a column',
    params: [
      { name: 'cell', type: 'string', description: 'Target cell or column letter for fill-down', required: true },
      { name: 'formula', type: 'string', description: 'Formula starting with =', required: true },
    ],
    examples: ['sum column B', 'average of C2:C20 in C21', 'add a total at the bottom'],
  },
  {
    name: 'modify_column',
    category: 'mutate',
    description: 'Apply a math operation to all numeric values in a column',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
      { name: 'operation', type: 'string', description: 'multiply, add, subtract, divide', required: true },
      { name: 'factor', type: 'number', description: 'The number to apply', required: true },
    ],
    examples: ['add 10% to column B', 'double all values in C'],
  },
  {
    name: 'find_and_replace',
    category: 'mutate',
    description: 'Find and replace values across the sheet',
    params: [
      { name: 'find', type: 'string', description: 'Text to find', required: true },
      { name: 'replace', type: 'string', description: 'Replacement text', required: true },
      { name: 'column', type: 'string', description: 'Limit to specific column (optional)' },
    ],
    examples: ['replace all "TBD" with "Pending"', 'change Rent to Housing in column A'],
  },
  {
    name: 'sort_sheet',
    category: 'mutate',
    description: 'Sort the sheet by a column',
    params: [
      { name: 'column', type: 'string', description: 'Column letter to sort by', required: true },
      { name: 'direction', type: 'string', description: '"asc" or "desc"' },
    ],
    examples: ['sort by amount highest first', 'sort column A alphabetically'],
  },
  {
    name: 'filter',
    category: 'mutate',
    description: 'Filter visible rows by a column condition',
    params: [
      { name: 'column', type: 'string', description: 'Column letter or header name', required: true },
      { name: 'condition', type: 'string', description: 'gt, lt, eq, contains, not_empty', required: true },
      { name: 'value', type: 'string', description: 'Comparison value (not needed for not_empty)' },
    ],
    examples: ['filter rows where amount > 100', 'show only rows containing Rent'],
  },
  {
    name: 'clear_sheet',
    category: 'mutate',
    description: 'Clear all data from the current sheet',
    params: [],
    examples: ['clear everything', 'start over', 'reset the sheet'],
  },
  {
    name: 'rename_sheet',
    category: 'mutate',
    description: 'Rename the current sheet tab',
    params: [
      { name: 'name', type: 'string', description: 'New sheet name', required: true },
    ],
    examples: ['rename this sheet to January', 'call this tab Expenses'],
  },
  // ─── Read-only analysis (no sheet mutation) ───────────────────────────────
  {
    name: 'find_max',
    category: 'read',
    description: 'Find the maximum value in a column and which row it belongs to',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
    ],
    examples: ['what is my biggest expense', 'highest value in B'],
  },
  {
    name: 'find_min',
    category: 'read',
    description: 'Find the minimum value in a column and which row it belongs to',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
    ],
    examples: ['smallest expense', 'lowest value in column C'],
  },
  {
    name: 'analyze_data',
    category: 'read',
    description: 'Analyze the current sheet and provide a plain-English summary',
    params: [],
    examples: ['explain this sheet', 'summarize my expenses'],
  },
  // ─── Templates (executed by the store's template handlers) ────────────────
  {
    name: 'create_budget_template',
    category: 'template',
    description: 'Build a monthly budget with income, expenses, totals',
    params: [],
    examples: ['build a monthly budget', 'create a budget'],
  },
  {
    name: 'create_sales_tracker',
    category: 'template',
    description: 'Create a sales tracking spreadsheet',
    params: [],
    examples: ['track sales', 'revenue tracker'],
  },
  {
    name: 'create_invoice',
    category: 'template',
    description: 'Generate a professional invoice template',
    params: [],
    examples: ['make an invoice', 'create a bill'],
  },
  {
    name: 'create_project_tracker',
    category: 'template',
    description: 'Create a project/task tracker',
    params: [],
    examples: ['project tracker', 'task list'],
  },
  {
    name: 'create_employee_roster',
    category: 'template',
    description: 'Build an employee directory',
    params: [],
    examples: ['employee roster', 'team directory'],
  },
  {
    name: 'create_kpi_dashboard',
    category: 'template',
    description: 'Create a KPI metrics dashboard',
    params: [],
    examples: ['kpi dashboard', 'metrics dashboard'],
  },
  {
    name: 'create_expense_report',
    category: 'template',
    description: 'Generate an expense report template',
    params: [],
    examples: ['expense report'],
  },
  {
    name: 'clean_sheet_data',
    category: 'template',
    description: 'Clean whitespace, normalize headers, trim data',
    params: [],
    examples: ['clean up my data', 'normalize headers'],
  },
  {
    name: 'create_chart',
    category: 'template',
    description: 'Create a chart (bar, pie, line, scatter)',
    params: [
      { name: 'type', type: 'string', description: 'bar, pie, line, scatter', required: true },
      { name: 'dataRange', type: 'string', description: 'Data range for the chart' },
    ],
    examples: ['chart my expenses', 'make a pie chart'],
  },
  // ─── Niche gallery templates (hidden from the LLM prompt) ──────────────────
  // Launched from the template gallery; executable everywhere, but excluded
  // from formatToolsForPrompt() to keep the LLM system prompt compact.
  ...NICHE_TEMPLATES.map(([name, description]): ToolDefinition => ({
    name,
    category: 'template',
    description,
    params: [],
    examples: [],
    hidden: true,
  })),
]

/** Canonical (non-alias) tool definitions. */
const CANONICAL_TOOLS = TOOL_REGISTRY.filter((t) => !t.aliasFor)

/** Names of tools that mutate the sheet (includes aliases so legacy calls keep working). */
export const MUTATION_TOOL_NAMES: string[] = TOOL_REGISTRY
  .filter((t) => t.category === 'mutate')
  .map((t) => t.name)

/** Names of template tools (executed by the store's template switch). */
export const TEMPLATE_TOOL_NAMES: string[] = TOOL_REGISTRY
  .filter((t) => t.category === 'template')
  .map((t) => t.name)

/**
 * Tools the server LLM is allowed to return as actions (mutate + template).
 * Read/analysis queries are answered in prose, never as actions.
 */
export const ACTION_TOOL_NAMES: string[] = TOOL_REGISTRY
  .filter((t) => t.category === 'mutate' || t.category === 'template')
  .map((t) => t.name)

/** Look up a tool definition by name (aliases included). */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name)
}

/** Resolve an alias to its canonical tool name; returns the input if not an alias. */
export function resolveToolName(name: string): string {
  return getToolDefinition(name)?.aliasFor ?? name
}

/** Format canonical action tools as a concise list for the LLM system prompt (hidden tools excluded). */
export function formatToolsForPrompt(): string {
  return CANONICAL_TOOLS
    .filter((t) => (t.category === 'mutate' || t.category === 'template') && !t.hidden)
    .map((t) => {
      const params = t.params.length > 0
        ? `{${t.params.map((p) => `${p.name}${p.required ? '' : '?'}`).join(', ')}}`
        : '{}'
      return `- ${t.name}: ${params} — ${t.description}`
    })
    .join('\n')
}

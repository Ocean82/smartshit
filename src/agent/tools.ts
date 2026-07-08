/**
 * Agent Tool Registry — granular spreadsheet operations.
 * Each tool is a pure function spec with name, description, param schema, and executor.
 * The agent routes natural language → tool calls → execution.
 */

export interface ToolParam {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array'
  description: string
  required?: boolean
}

export interface ToolDef {
  name: string
  description: string
  params: ToolParam[]
  examples: string[]  // Example natural language triggers
}

/** All available agent tools */
export const TOOL_REGISTRY: ToolDef[] = [
  // ─── Cell Operations ──────────────────────────────────────────────────────────
  {
    name: 'set_cell',
    description: 'Write a value or formula to a specific cell',
    params: [
      { name: 'cell', type: 'string', description: 'Cell reference like A1, B3', required: true },
      { name: 'value', type: 'string', description: 'Value or formula (formulas start with =)', required: true },
    ],
    examples: ['put 500 in B3', 'set A1 to Total', 'write =SUM(B1:B10) in B11'],
  },
  {
    name: 'set_range',
    description: 'Fill a range of cells with values',
    params: [
      { name: 'startCell', type: 'string', description: 'Top-left cell of range', required: true },
      { name: 'values', type: 'array', description: 'Array of arrays (rows) of values', required: true },
    ],
    examples: ['fill A1:A12 with months', 'put headers Name, Amount, Date in row 1'],
  },
  {
    name: 'add_row',
    description: 'Add a new row of data at the end of existing data or after a specific row',
    params: [
      { name: 'values', type: 'array', description: 'Array of values for the row', required: true },
      { name: 'afterRow', type: 'number', description: 'Insert after this row (0-indexed). Omit to append.', required: false },
    ],
    examples: ['add a row: Groceries, $400', 'add Netflix, $15, Entertainment'],
  },
  {
    name: 'delete_row',
    description: 'Delete a row by row number or by matching content',
    params: [
      { name: 'row', type: 'number', description: 'Row number (1-indexed)', required: false },
      { name: 'match', type: 'string', description: 'Delete the row containing this text', required: false },
    ],
    examples: ['delete row 5', 'remove the Netflix row', 'delete the rent row'],
  },
  {
    name: 'delete_column',
    description: 'Delete a column by letter',
    params: [
      { name: 'column', type: 'string', description: 'Column letter like A, B, C', required: true },
    ],
    examples: ['delete column D', 'remove the last column'],
  },
  // ─── Column/Header Operations ─────────────────────────────────────────────────
  {
    name: 'rename_header',
    description: 'Rename a column header',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
      { name: 'newName', type: 'string', description: 'New header text', required: true },
    ],
    examples: ['rename column B to Actual Spending', 'change header C to Status'],
  },
  {
    name: 'add_column',
    description: 'Add a new column with a header',
    params: [
      { name: 'header', type: 'string', description: 'Header name for the new column', required: true },
      { name: 'afterColumn', type: 'string', description: 'Insert after this column letter. Omit to append.', required: false },
      { name: 'formula', type: 'string', description: 'Formula to fill down (uses relative refs)', required: false },
    ],
    examples: ['add a Difference column', 'add a Total column that sums B and C'],
  },
  // ─── Formula Operations ───────────────────────────────────────────────────────
  {
    name: 'apply_formula',
    description: 'Apply a formula to a cell or a column',
    params: [
      { name: 'cell', type: 'string', description: 'Target cell or column letter for fill-down', required: true },
      { name: 'formula', type: 'string', description: 'Formula starting with =', required: true },
    ],
    examples: ['sum column B', 'average of C2:C20 in C21', 'add a total at the bottom'],
  },
  {
    name: 'fill_formula_down',
    description: 'Apply a formula to every row in a column (relative references adjust per row)',
    params: [
      { name: 'column', type: 'string', description: 'Column letter to fill', required: true },
      { name: 'formula', type: 'string', description: 'Formula with relative row refs', required: true },
      { name: 'startRow', type: 'number', description: 'First data row (1-indexed)', required: true },
      { name: 'endRow', type: 'number', description: 'Last data row (1-indexed)', required: true },
    ],
    examples: ['fill column D with =B{row}-C{row}', 'calculate profit in every row'],
  },
  // ─── Sort & Filter ────────────────────────────────────────────────────────────
  {
    name: 'sort_sheet',
    description: 'Sort the sheet by a column',
    params: [
      { name: 'column', type: 'string', description: 'Column letter to sort by', required: true },
      { name: 'direction', type: 'string', description: '"asc" or "desc"', required: false },
    ],
    examples: ['sort by amount highest first', 'sort column A alphabetically', 'sort by date'],
  },
  {
    name: 'filter_rows',
    description: 'Show only rows matching a condition',
    params: [
      { name: 'column', type: 'string', description: 'Column to filter on', required: true },
      { name: 'operator', type: 'string', description: 'gt, lt, eq, contains, not_empty', required: true },
      { name: 'value', type: 'string', description: 'Value to compare against', required: true },
    ],
    examples: ['show only expenses over $100', 'filter where status is Complete', 'hide empty rows'],
  },
  // ─── Formatting ───────────────────────────────────────────────────────────────
  {
    name: 'format_range',
    description: 'Apply formatting to a range of cells',
    params: [
      { name: 'range', type: 'string', description: 'Range like A1:D1 or A:A for full column', required: true },
      { name: 'bold', type: 'boolean', description: 'Make bold', required: false },
      { name: 'bgColor', type: 'string', description: 'Background color hex', required: false },
      { name: 'fontColor', type: 'string', description: 'Font color hex', required: false },
      { name: 'fontSize', type: 'number', description: 'Font size in px', required: false },
    ],
    examples: ['bold the headers', 'highlight row 1 in blue', 'make column A red'],
  },
  {
    name: 'conditional_format',
    description: 'Highlight cells based on a condition',
    params: [
      { name: 'column', type: 'string', description: 'Column to evaluate', required: true },
      { name: 'condition', type: 'string', description: 'gt, lt, eq, negative, positive', required: true },
      { name: 'value', type: 'number', description: 'Threshold value', required: false },
      { name: 'color', type: 'string', description: 'Highlight color hex', required: false },
    ],
    examples: ['highlight negatives in red', 'color expenses over 500 orange', 'green for positive values'],
  },
  // ─── Sheet Operations ─────────────────────────────────────────────────────────
  {
    name: 'clear_sheet',
    description: 'Clear all data from the current sheet',
    params: [],
    examples: ['clear everything', 'start over', 'reset the sheet', 'blank slate'],
  },
  {
    name: 'rename_sheet',
    description: 'Rename the current sheet tab',
    params: [
      { name: 'name', type: 'string', description: 'New sheet name', required: true },
    ],
    examples: ['rename this sheet to January', 'call this tab Expenses'],
  },
  {
    name: 'duplicate_sheet',
    description: 'Copy the current sheet to a new tab',
    params: [
      { name: 'newName', type: 'string', description: 'Name for the copy', required: false },
    ],
    examples: ['duplicate this sheet', 'copy to a new tab called February'],
  },
  // ─── Template Operations ──────────────────────────────────────────────────────
  {
    name: 'create_budget_template',
    description: 'Create a full monthly budget template with income, expenses, and calculations',
    params: [],
    examples: ['build a monthly budget', 'create a budget', 'expense tracker'],
  },
  {
    name: 'create_sales_tracker',
    description: 'Create a sales tracking spreadsheet',
    params: [],
    examples: ['track sales', 'revenue tracker', 'sales spreadsheet'],
  },
  {
    name: 'create_invoice',
    description: 'Create a professional invoice template',
    params: [],
    examples: ['make an invoice', 'create a bill', 'invoice template'],
  },
  {
    name: 'create_project_tracker',
    description: 'Create a project/task tracking spreadsheet',
    params: [],
    examples: ['project tracker', 'task list', 'project plan'],
  },
  {
    name: 'create_employee_roster',
    description: 'Create an employee roster/directory',
    params: [],
    examples: ['employee roster', 'team directory', 'staff list'],
  },
  // ─── Data Operations ──────────────────────────────────────────────────────────
  {
    name: 'find_and_replace',
    description: 'Find and replace values across the sheet',
    params: [
      { name: 'find', type: 'string', description: 'Text to find', required: true },
      { name: 'replace', type: 'string', description: 'Replacement text', required: true },
      { name: 'column', type: 'string', description: 'Limit to specific column (optional)', required: false },
    ],
    examples: ['replace all "TBD" with "Pending"', 'change Rent to Housing in column A'],
  },
  {
    name: 'modify_column',
    description: 'Apply a math operation to all numeric values in a column',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
      { name: 'operation', type: 'string', description: 'multiply, add, subtract, divide', required: true },
      { name: 'factor', type: 'number', description: 'The number to apply', required: true },
    ],
    examples: ['add 10% to column B', 'double all values in C', 'subtract 50 from column D'],
  },
  // ─── Analysis (read-only, returns info) ───────────────────────────────────────
  {
    name: 'analyze_data',
    description: 'Analyze the current sheet and provide a plain-English summary',
    params: [],
    examples: ['explain this sheet', 'what does this data mean', 'summarize my expenses'],
  },
  {
    name: 'find_max',
    description: 'Find the maximum value in a column and which row it belongs to',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
    ],
    examples: ['what is my biggest expense', 'highest value in B', 'max revenue'],
  },
  {
    name: 'find_min',
    description: 'Find the minimum value in a column and which row it belongs to',
    params: [
      { name: 'column', type: 'string', description: 'Column letter', required: true },
    ],
    examples: ['smallest expense', 'lowest value in column C', 'cheapest item'],
  },
  {
    name: 'compare_columns',
    description: 'Compare two columns and summarize differences',
    params: [
      { name: 'columnA', type: 'string', description: 'First column', required: true },
      { name: 'columnB', type: 'string', description: 'Second column', required: true },
    ],
    examples: ['compare budget vs actual', 'difference between columns B and C'],
  },
]

/** Get tool definition by name */
export function getToolDef(name: string): ToolDef | undefined {
  return TOOL_REGISTRY.find(t => t.name === name)
}

/** Get all tool names */
export function getToolNames(): string[] {
  return TOOL_REGISTRY.map(t => t.name)
}

/** Format tools as a concise description for LLM context */
export function formatToolsForPrompt(): string {
  return TOOL_REGISTRY.map(t => {
    const params = t.params.length > 0
      ? ` (${t.params.map(p => `${p.name}:${p.type}${p.required ? '' : '?'}`).join(', ')})`
      : ''
    return `- ${t.name}${params}: ${t.description}`
  }).join('\n')
}

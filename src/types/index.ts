export interface CellData {
  value: string | number | boolean | null;
  formula?: string;
  displayValue?: string;
  format?: CellFormat;
  validation?: DataValidation;
  validationError?: string;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  numberFormat?: string;
  borders?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  conditionalRules?: ConditionalRule[];
}

export interface ConditionalRule {
  type: 'greaterThan' | 'lessThan' | 'equals' | 'between' | 'text' | 'colorScale' | 'dataBar';
  value: number | string;
  value2?: number | string;
  style: Partial<CellFormat>;
  /** Fill color for data-bar rules (defaults to a soft blue). */
  dataBarColor?: string;
}

export interface DataValidation {
  type: 'number' | 'text' | 'date' | 'list' | 'custom';
  /** Criteria/operator for the validation rule */
  criteria?: string;
  /** Allowed values for list type */
  values?: string[];
  /** Minimum value (number) or minimum length (text) */
  min?: number;
  /** Maximum value (number) or maximum length (text) */
  max?: number;
  /** Custom error message */
  message?: string;
  /** Text to check for contains/startsWith/endsWith (text type) */
  containsText?: string;
  /** Minimum date (ISO string) for date range validation */
  dateMin?: string;
  /** Maximum date (ISO string) for date range validation */
  dateMax?: string;
}

export interface PivotField {
  sourceColumn: string;
  aggregation: 'sum' | 'count' | 'average' | 'min' | 'max' | 'distinctCount';
  label?: string;
}

export interface PivotConfig {
  sourceSheetId: string;
  sourceRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  rows: PivotField[];
  columns: PivotField[];
  values: PivotField[];
}

export interface PivotResult {
  headers: string[];
  rows: Array<(string | number)[]>;
  grandTotals: (string | number)[];
}

export interface SheetData {
  id: string;
  name: string;
  cells: Record<string, CellData>;
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  frozenRows?: number;
  frozenCols?: number;
  filters?: FilterConfig[];
  sortConfig?: SortConfig;
  charts?: ChartConfig[];
  mergedCells?: string[];
  pivotConfig?: PivotConfig;
  pivotResult?: PivotResult;
}

export interface FilterConfig {
  column: number;
  /** Allow-list of values (legacy / multi-select). */
  values?: (string | number)[];
  /** Comparison operator for dialog-driven filters. */
  condition?: 'equals' | 'contains' | 'gt' | 'lt' | string;
  /** Single comparison value for equals/contains/gt/lt. */
  value?: string | number;
}

export interface SortConfig {
  column: number;
  direction: 'asc' | 'desc';
}

export interface ChartConfig {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'column';
  title: string;
  dataRange: string;
  labelRange?: string;
  position: { x: number; y: number; width: number; height: number };
  colors?: string[];
  /** Multi-series definitions. When present, each series is plotted separately. */
  series?: ChartSeries[];
  /** Trend line configuration. Only applies to line/scatter/area/column/bar charts. */
  trendLine?: TrendLineConfig;
  /** Axis configuration (min/max, labels, gridlines). */
  axisConfig?: AxisConfig;
}

export interface ChartSeries {
  /** Column or range for this series data values */
  dataRange: string;
  /** Series display name (shown in legend) */
  label: string;
  /** Optional color override for this series */
  color?: string;
}

export interface TrendLineConfig {
  type: 'linear' | 'exponential' | 'polynomial' | 'movingAverage';
  /** Polynomial degree (only for type: 'polynomial'). Defaults to 2. */
  degree?: number;
  /** Window size for moving average. Defaults to 3. */
  period?: number;
  /** Color of the trend line */
  color?: string;
  /** Show the equation label on chart */
  showEquation?: boolean;
}

export interface AxisConfig {
  /** Custom Y-axis minimum value (auto-scaled if omitted) */
  yMin?: number;
  /** Custom Y-axis maximum value (auto-scaled if omitted) */
  yMax?: number;
  /** X-axis label */
  xLabel?: string;
  /** Y-axis label */
  yLabel?: string;
  /** Show gridlines (defaults to true) */
  showGrid?: boolean;
}

export interface WorkbookData {
  id: string;
  name: string;
  sheets: SheetData[];
  activeSheetId: string;
  createdAt: number;
  updatedAt: number;
}

export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  workbookId?: string;
  children?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actions?: AgentAction[];
  status?: 'pending' | 'applied' | 'rejected';
  toolUsed?: string;
  insightsSnapshot?: Record<string, unknown>;
  suggestions?: string[];
  /** Whether this message is pinned/bookmarked by the user */
  pinned?: boolean;
}

export interface AgentAction {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  description: string;
  status: 'pending' | 'applied' | 'rejected' | 'preview';
  preview?: {
    changes: CellChange[];
  };
}

export interface CellChange {
  cell: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
  oldFormula?: string;
  newFormula?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  tools: string[];
  icon: string;
}

export interface Selection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export type CellRef = { row: number; col: number };

// ─── Toast System ───
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
  undoAction?: () => void;
}

// ─── Confirmation Dialog ───
export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm?: () => void;
  onCancel?: () => void;
}

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
  type: ConditionalRuleType;
  value: number | string;
  value2?: number | string;
  style: Partial<CellFormat>;
  /** Fill color for data-bar rules (defaults to a soft blue). */
  dataBarColor?: string;
  /** Negative color for data bars (defaults to red). */
  dataBarNegativeColor?: string;
  /** Whether data bar shows gradient fill. */
  dataBarGradient?: boolean;
  /** Color scale configuration (2 or 3 color stops). */
  colorScaleConfig?: ColorScaleStop[];
  /** Icon set configuration. */
  iconSetConfig?: IconSetConfig;
}

export type ConditionalRuleType =
  | 'greaterThan'
  | 'lessThan'
  | 'equals'
  | 'notEquals'
  | 'between'
  | 'notBetween'
  | 'text'
  | 'colorScale'
  | 'dataBar'
  | 'iconSet'
  | 'duplicateValues'
  | 'uniqueValues'
  | 'top10'
  | 'bottom10'
  | 'aboveAverage'
  | 'belowAverage';

export interface ColorScaleStop {
  /** Position type: 'min' | 'max' | 'percent' | 'percentile' | 'number' */
  type: 'min' | 'max' | 'percent' | 'percentile' | 'number';
  /** Value for 'percent', 'percentile', 'number' types. */
  value?: number;
  /** CSS color string. */
  color: string;
}

export interface IconSetConfig {
  /** Icon set type name (e.g., '3Arrows', '3TrafficLights', '5Rating'). */
  iconSetType: IconSetType;
  /** Thresholds (as percentages) for switching icons. Length = iconCount - 1. */
  thresholds: number[];
  /** Whether to show the cell value alongside the icon. */
  showValue?: boolean;
  /** Whether to reverse the icon order. */
  reverseOrder?: boolean;
}

export type IconSetType =
  | '3Arrows'
  | '3ArrowsGray'
  | '3TrafficLights'
  | '3Signs'
  | '3Flags'
  | '3Stars'
  | '3Symbols'
  | '4Arrows'
  | '4ArrowsGray'
  | '4TrafficLights'
  | '4Rating'
  | '5Arrows'
  | '5ArrowsGray'
  | '5Rating'
  | '5Quarters';

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
  condition?: FilterConditionType;
  /** Single comparison value for comparison filters. */
  value?: string | number;
  /** Second value for 'between'/'notBetween' conditions. */
  value2?: string | number;
  /** Whether to include blank cells (defaults to false). */
  includeBlank?: boolean;
  /** Logical join when multiple conditions on same column: 'and' | 'or'. Default: 'and'. */
  logic?: 'and' | 'or';
}

export type FilterConditionType =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'notBetween'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'wildcard';

export interface SortConfig {
  column: number;
  direction: 'asc' | 'desc';
}

/** Multi-column sort: ordered list of sort rules applied sequentially. */
export interface MultiSortConfig {
  rules: SortRule[];
  hasHeader?: boolean;
}

export interface SortRule {
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

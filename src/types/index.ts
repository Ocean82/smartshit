export interface CellData {
  value: string | number | boolean | null;
  formula?: string;
  displayValue?: string;
  format?: CellFormat;
  validation?: DataValidation;
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
  type: 'greaterThan' | 'lessThan' | 'equals' | 'between' | 'text' | 'colorScale';
  value: number | string;
  value2?: number | string;
  style: Partial<CellFormat>;
}

export interface DataValidation {
  type: 'number' | 'text' | 'date' | 'list' | 'custom';
  criteria?: string;
  values?: string[];
  min?: number;
  max?: number;
  message?: string;
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
}

export interface FilterConfig {
  column: number;
  values?: (string | number)[];
  condition?: string;
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

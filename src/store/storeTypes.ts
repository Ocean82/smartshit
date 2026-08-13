/**
 * Shared AppState type for the composed Zustand store.
 * Kept separate from useStore.ts so slices and AI helpers can import it
 * without circular dependencies on the store instance.
 */

import type {
  WorkbookData,
  SheetData,
  CellData,
  CellFormat,
  Selection,
  ChatMessage,
  FileItem,
  Skill,
  ChartConfig,
  FilterConfig,
  SortConfig,
  SortRule,
  DataValidation,
} from '@/types'
import type { SpreadsheetEngine } from '@/engine/spreadsheet'
import type { AttachedFilePreview } from '@/ai/types'
import type { HistoryEntry } from '@/lib/historyDiff'
import type { SortPatch } from '@/lib/sheetSort'
import type { UIState, UIActions } from './slices/uiSlice'
import type { FileActions } from './slices/fileSlice'
import type { ChatActions } from './slices/chatSlice'

/** Maximum undo stack depth — patches are lightweight */
export const MAX_UNDO_STACK = 150

export interface AppState extends UIState, UIActions, FileActions, ChatActions {
  // Workbook
  workbook: WorkbookData
  engine: SpreadsheetEngine

  // Sheet / selection / edit
  activeSheetId: string
  selection: Selection | null
  editingCell: string | null
  editValue: string

  // Panel system extras
  lastAuditResult: import('@/auditor/types').AuditResult | null

  // History
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]

  // Files
  files: FileItem[]
  activeFileId: string | null

  // Chat
  messages: ChatMessage[]
  chatInput: string
  isAiProcessing: boolean
  attachedFilePreview: AttachedFilePreview | null

  // Skills
  skills: Skill[]

  // Clipboard
  clipboard: { cells: Record<string, CellData>; selection: Selection } | null
  copiedRange: Selection | null

  // Multi-range selection (Ctrl+click)
  additionalSelections: Selection[]

  // Sort/Filter
  activeFilters: FilterConfig[]
  activeSortConfig: SortConfig | null

  // Workbook / sheet actions
  initWorkbook: (name?: string) => void
  setActiveSheet: (sheetId: string) => void
  addSheet: (name?: string) => void
  deleteSheet: (sheetId: string) => void
  renameSheet: (sheetId: string, name: string) => void
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
  setRangeFormat: (format: Partial<CellFormat>) => void
  setSelection: (sel: Selection | null) => void
  addSelection: (sel: Selection) => void
  setEditingCell: (cellId: string | null) => void
  setEditValue: (val: string) => void

  // Validation
  setCellValidation: (cellId: string, validation: DataValidation | null) => void
  validateCellValue: (cellId: string, value: string | number | null) => { valid: boolean; message?: string }

  // History
  pushHistory: (desc: string) => void
  undo: () => void
  redo: () => void

  // Clipboard
  copy: () => void
  cut: () => void
  paste: () => void

  // Data operations
  addChart: (chart: ChartConfig) => void
  removeChart: (chartId: string) => void
  updateChartPosition: (chartId: string, x: number, y: number) => void
  setFreeze: (rows: number, cols: number) => void
  setSortConfig: (config: SortConfig | null) => void
  setFilters: (filters: FilterConfig[]) => void
  sortByColumn: (column: number, direction: 'asc' | 'desc') => void
  multiSort: (rules: SortRule[]) => void
  applySortPatch: (patch: SortPatch) => void
  applyOuterBorders: (borderValue: string) => void
  applyConditionalFormat: (
    column: number,
    condition: string,
    color: string,
    threshold?: number,
  ) => void
  deleteSelectedCells: () => void
  insertRow: (afterRow: number) => void
  insertColumn: (afterCol: number) => void
  deleteRow: (row: number) => void
  deleteColumn: (col: number) => void

  // Bulk operations (for AI)
  bulkSetCells: (cells: Record<string, { value: string | number | boolean | null; formula?: string }>) => void
  importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string }) => void
  loadWorkbookData: (workbook: WorkbookData) => void

  // Get helpers
  getActiveSheet: () => SheetData
  getCellData: (cellId: string) => CellData | undefined
  getComputedValue: (row: number, col: number) => string
}

/** Immer middleware set — kept loose to match Zustand draft typing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreSet = any
export type StoreGet = () => AppState

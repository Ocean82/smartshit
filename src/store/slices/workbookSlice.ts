/**
 * Workbook / sheet mutation slice.
 * Sheet CRUD, cells, format, clipboard, charts, sort/filter, structure, import.
 */

import type {
  WorkbookData,
  SheetData,
  CellData,
  CellFormat,
  Selection,
  ChartConfig,
  FilterConfig,
  SortConfig,
  SortRule,
  DataValidation,
} from '@/types'
import {
  createEmptyWorkbook,
  createEmptySheet,
  refToCell,
  cellToRef,
  type SpreadsheetEngine,
} from '@/engine/spreadsheet'
import { computeSortedCellUpdates, computeMultiSortedCellUpdates, type SortPatch } from '@/lib/sheetSort'
import { conditionToRule, attachConditionalRuleToColumn } from '@/lib/conditionalFormat'
import { getActionRecorder } from '@/lib/actionRecorder'
import { validateCell } from '@/lib/validation'
import type { HistoryEntry } from '@/lib/historyDiff'

export interface WorkbookSliceState {
  workbook: WorkbookData
  engine: SpreadsheetEngine
  activeSheetId: string
  selection: Selection | null
  editingCell: string | null
  editValue: string
  additionalSelections: Selection[]
  clipboard: { cells: Record<string, CellData>; selection: Selection } | null
  copiedRange: Selection | null
  activeFilters: FilterConfig[]
  activeSortConfig: SortConfig | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  pushHistory: (desc: string) => void
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
  deleteSelectedCells: () => void
  applySortPatch: (patch: SortPatch) => void
  copy: () => void
  cut: () => void
  paste: () => void
  insertRow: (afterRow: number) => void
  deleteRow: (row: number) => void
  renameSheet: (sheetId: string, name: string) => void
  addSheet: (name?: string) => void
  addChart: (chart: ChartConfig) => void
  setFilters: (filters: FilterConfig[]) => void
  getActiveSheet: () => SheetData
  getComputedValue: (row: number, col: number) => string
}

export interface WorkbookActions {
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
  setCellValidation: (cellId: string, validation: DataValidation | null) => void
  validateCellValue: (cellId: string, value: string | number | null) => { valid: boolean; message?: string }
  copy: () => void
  cut: () => void
  paste: () => void
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
  bulkSetCells: (cells: Record<string, { value: string | number | boolean | null; formula?: string }>) => void
  importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string }) => void
  loadWorkbookData: (workbook: WorkbookData) => void
  getActiveSheet: () => SheetData
  getCellData: (cellId: string) => CellData | undefined
  getComputedValue: (row: number, col: number) => string
}

export function createWorkbookActions(
  set: (fn: (s: WorkbookSliceState) => void) => void,
  get: () => WorkbookSliceState,
): WorkbookActions {
  return {
      initWorkbook: (name = 'Untitled Workbook') => {
        const wb = createEmptyWorkbook(name);
        const eng = get().engine;
        eng.loadWorkbook(wb);
        set((s) => {
          s.workbook = wb;
          s.activeSheetId = wb.activeSheetId;
          s.undoStack = [];
          s.redoStack = [];
        });
      },

      setActiveSheet: (sheetId) => {
        set((s) => {
          s.activeSheetId = sheetId;
          s.workbook.activeSheetId = sheetId;
          s.selection = null;
          s.editingCell = null;
        });
        // Execute AI formulas for the newly active sheet
        const state = get();
        const activeSheet = state.getActiveSheet();
        state.engine.executeAIFormulasForSheet(
          activeSheet.id,
          activeSheet.cells,
          (ref) => {
            const refPos = cellToRef(ref);
            return state.engine.getComputedValue(state.activeSheetId, refPos.row, refPos.col) || null;
          }
        );
      },

      addSheet: (name?: string) => {
        const sheets = get().workbook.sheets;
        const sheetName = name || `Sheet ${sheets.length + 1}`;
        const sheet = createEmptySheet(sheetName);
        const eng = get().engine;
        set((s) => {
          s.workbook.sheets.push(sheet);
          s.activeSheetId = sheet.id;
          s.workbook.activeSheetId = sheet.id;
          s.workbook.updatedAt = Date.now();
        });
        eng.loadSheet(sheet);
      },

      deleteSheet: (sheetId) => {
        const state = get();
        if (state.workbook.sheets.length <= 1) return;
        get().pushHistory('Delete sheet');
        set((s) => {
          s.workbook.sheets = s.workbook.sheets.filter((sh) => sh.id !== sheetId);
          if (s.activeSheetId === sheetId) {
            s.activeSheetId = s.workbook.sheets[0].id;
            s.workbook.activeSheetId = s.workbook.sheets[0].id;
          }
          s.workbook.updatedAt = Date.now();
        });
        get().engine.loadWorkbook(get().workbook);
      },

      renameSheet: (sheetId, name) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === sheetId);
          if (sheet) sheet.name = name;
          s.workbook.updatedAt = Date.now();
        });
        get().engine.loadWorkbook(get().workbook);
      },

      setCellValue: (cellId, value, formula) => {
        const state = get();
        const ref = cellToRef(cellId);
        // AI formulas are handled by our registry, not Formualizer
        const isAI = formula && state.engine.isAIFormula(formula);
        if (!isAI) {
          state.engine.setCellValue(state.activeSheetId, ref.row, ref.col, formula || value);
        }
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          if (value === null && !formula) {
            delete sheet.cells[cellId];
          } else {
            if (!sheet.cells[cellId]) {
              sheet.cells[cellId] = { value: null };
            }
            sheet.cells[cellId].value = value;
            sheet.cells[cellId].formula = formula;
            // Clear stale displayValue when formula changes
            if (isAI) {
              sheet.cells[cellId].displayValue = undefined;
            }
          }
          s.workbook.updatedAt = Date.now();
        });
        // Trigger AI formula execution after state update
        if (isAI) {
          const newState = get();
          void newState.engine.executeAIFormula(
            cellId,
            formula!,
            (ref) => {
              const refPos = cellToRef(ref);
              return newState.engine.getComputedValue(newState.activeSheetId, refPos.row, refPos.col) || null;
            }
          );
        }
      },

      setCellFormat: (cellId, format) => {
        // Callers that batch many format writes (templates/AI) pushHistory once upstream.
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          if (!sheet.cells[cellId]) {
            sheet.cells[cellId] = { value: null };
          }
          const existing = sheet.cells[cellId].format;
          sheet.cells[cellId].format = {
            ...existing,
            ...format,
            borders: format.borders
              ? { ...existing?.borders, ...format.borders }
              : existing?.borders,
          };
        });
      },

      setRangeFormat: (format) => {
        const sel = get().selection;
        if (!sel) return;
        get().pushHistory('Format cells');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          // Apply to primary selection + any additional Ctrl+click ranges
          const allRanges = [sel, ...s.additionalSelections];
          for (const range of allRanges) {
            const minR = Math.min(range.startRow, range.endRow);
            const maxR = Math.max(range.startRow, range.endRow);
            const minC = Math.min(range.startCol, range.endCol);
            const maxC = Math.max(range.startCol, range.endCol);
            for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                const cid = refToCell(r, c);
                if (!sheet.cells[cid]) {
                  sheet.cells[cid] = { value: null };
                }
                const existing = sheet.cells[cid].format;
                sheet.cells[cid].format = {
                  ...existing,
                  ...format,
                  borders: format.borders
                    ? { ...existing?.borders, ...format.borders }
                    : existing?.borders,
                };
              }
            }
          }
        });
      },

      setSelection: (sel) => set((s) => { s.selection = sel; s.additionalSelections = []; }),
      addSelection: (sel: Selection) => set((s) => {
        if (s.selection) {
          s.additionalSelections = [...s.additionalSelections, s.selection];
        }
        s.selection = sel;
      }),
      setEditingCell: (cellId) => set((s) => { s.editingCell = cellId; }),
      setEditValue: (val) => set((s) => { s.editValue = val; }),

      setCellValidation: (cellId, validation) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          if (!sheet.cells[cellId]) {
            sheet.cells[cellId] = { value: null };
          }
          sheet.cells[cellId].validation = validation || undefined;
        });
      },

      validateCellValue: (cellId, value) => {
        const sheet = get().getActiveSheet();
        const cell = sheet.cells[cellId];
        if (!cell?.validation) return { valid: true };
        return validateCell(value, cell.validation);
      },













      copy: () => {
        const sel = get().selection;
        if (!sel) return;
        const sheet = get().getActiveSheet();
        const cells: Record<string, CellData> = {};
        const minR = Math.min(sel.startRow, sel.endRow);
        const maxR = Math.max(sel.startRow, sel.endRow);
        const minC = Math.min(sel.startCol, sel.endCol);
        const maxC = Math.max(sel.startCol, sel.endCol);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const cid = refToCell(r, c);
            if (sheet.cells[cid]) {
              cells[cid] = { ...sheet.cells[cid] };
            }
          }
        }
        set((s) => { s.clipboard = { cells, selection: sel }; s.copiedRange = sel; });
      },

      cut: () => {
        get().copy();
        get().deleteSelectedCells();
      },

      paste: () => {
        const { clipboard, selection } = get();
        if (!clipboard || !selection) return;
        get().pushHistory('Paste');
        const srcMinR = Math.min(clipboard.selection.startRow, clipboard.selection.endRow);
        const srcMinC = Math.min(clipboard.selection.startCol, clipboard.selection.endCol);
        const dstR = Math.min(selection.startRow, selection.endRow);
        const dstC = Math.min(selection.startCol, selection.endCol);

        for (const [cellId, cellData] of Object.entries(clipboard.cells)) {
          const ref = cellToRef(cellId);
          const newR = ref.row - srcMinR + dstR;
          const newC = ref.col - srcMinC + dstC;
          const newCellId = refToCell(newR, newC);
          get().setCellValue(newCellId, cellData.value, cellData.formula);
          if (cellData.format) {
            get().setCellFormat(newCellId, cellData.format);
          }
        }
        set((s) => { s.copiedRange = null; });
      },

      addChart: (chart) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (sheet) {
            if (!sheet.charts) sheet.charts = [];
            sheet.charts.push(chart);
          }
        });
      },

      removeChart: (chartId) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (sheet && sheet.charts) {
            sheet.charts = sheet.charts.filter((c) => c.id !== chartId);
          }
        });
      },

      updateChartPosition: (chartId, x, y) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (sheet && sheet.charts) {
            const chart = sheet.charts.find((c) => c.id === chartId);
            if (chart) {
              chart.position.x = x;
              chart.position.y = y;
            }
          }
        });
      },

      setFreeze: (rows, cols) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (sheet) {
            sheet.frozenRows = rows;
            sheet.frozenCols = cols;
          }
        });
      },

      setSortConfig: (config) => {
        set((s) => { s.activeSortConfig = config; });
      },

      setFilters: (filters) => {
        set((s) => { s.activeFilters = filters; });
        getActionRecorder().recordAction('filter', { filters }, `Set ${filters.length} filter(s)`);
      },

      sortByColumn: (column, direction) => {
        const sheet = get().getActiveSheet();
        get().pushHistory(`Sort by column ${column}`);
        const patch = computeSortedCellUpdates(
          sheet,
          column,
          direction,
          (row, col) => get().getComputedValue(row, col),
        );
        get().applySortPatch(patch);
        set((s) => { s.activeSortConfig = { column, direction }; });
        getActionRecorder().recordAction('sort_sheet', { column, direction }, `Sort by column ${column} (${direction})`);
      },

      multiSort: (rules) => {
        if (!rules.length) return;
        const sheet = get().getActiveSheet();
        get().pushHistory(`Multi-sort by ${rules.length} column(s)`);
        const patch = computeMultiSortedCellUpdates(
          sheet,
          rules,
          (row, col) => get().getComputedValue(row, col),
        );
        get().applySortPatch(patch);
        set((s) => { s.activeSortConfig = { column: rules[0].column, direction: rules[0].direction }; });
        getActionRecorder().recordAction('multi_sort', { rules }, `Multi-sort by ${rules.length} column(s)`);
      },

      applySortPatch: (patch) => {
        const state = get();
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          for (const cellId of patch.deletes) {
            const ref = cellToRef(cellId);
            state.engine.setCellValue(s.activeSheetId, ref.row, ref.col, null);
            delete sheet.cells[cellId];
          }
          for (const [cellId, cell] of Object.entries(patch.writes)) {
            const ref = cellToRef(cellId);
            state.engine.setCellValue(s.activeSheetId, ref.row, ref.col, cell.formula || cell.value);
            sheet.cells[cellId] = {
              value: cell.value,
              formula: cell.formula,
              format: cell.format,
              validation: cell.validation,
              validationError: cell.validationError,
              displayValue: cell.displayValue,
            };
          }
          s.workbook.updatedAt = Date.now();
        });
      },

      applyOuterBorders: (borderValue) => {
        const sel = get().selection;
        if (!sel) return;
        get().pushHistory('Outer borders');
        const minR = Math.min(sel.startRow, sel.endRow);
        const maxR = Math.max(sel.startRow, sel.endRow);
        const minC = Math.min(sel.startCol, sel.endCol);
        const maxC = Math.max(sel.startCol, sel.endCol);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            const borders: NonNullable<CellFormat['borders']> = {};
            if (r === minR) borders.top = borderValue;
            if (r === maxR) borders.bottom = borderValue;
            if (c === minC) borders.left = borderValue;
            if (c === maxC) borders.right = borderValue;
            if (Object.keys(borders).length === 0) continue;
            get().setCellFormat(refToCell(r, c), { borders });
          }
        }
      },

      applyConditionalFormat: (column, condition, color, threshold = 0) => {
        const sheet = get().getActiveSheet();
        get().pushHistory(`Conditional format column ${column}`);
        const rule = conditionToRule(condition, color, threshold);
        attachConditionalRuleToColumn(sheet, column, rule, (cellId, format) => {
          get().setCellFormat(cellId, format);
        });
        getActionRecorder().recordAction('conditional_format', { column, condition, color, threshold }, `Conditional format column ${column}`);
      },

      deleteSelectedCells: () => {
        const sel = get().selection;
        if (!sel) return;
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const minR = Math.min(sel.startRow, sel.endRow);
          const maxR = Math.max(sel.startRow, sel.endRow);
          const minC = Math.min(sel.startCol, sel.endCol);
          const maxC = Math.max(sel.startCol, sel.endCol);
          for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
              const cid = refToCell(r, c);
              delete sheet.cells[cid];
            }
          }
        });
        get().engine.loadWorkbook(get().workbook);
      },

      insertRow: (afterRow) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          // Shift all cells down
          const newCells: Record<string, CellData> = {};
          for (const [cellId, data] of Object.entries(sheet.cells)) {
            const ref = cellToRef(cellId);
            if (ref.row > afterRow) {
              newCells[refToCell(ref.row + 1, ref.col)] = data;
            } else {
              newCells[cellId] = data;
            }
          }
          sheet.cells = newCells;
        });
        get().engine.loadWorkbook(get().workbook);
      },

      insertColumn: (afterCol) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const newCells: Record<string, CellData> = {};
          for (const [cellId, data] of Object.entries(sheet.cells)) {
            const ref = cellToRef(cellId);
            if (ref.col > afterCol) {
              newCells[refToCell(ref.row, ref.col + 1)] = data;
            } else {
              newCells[cellId] = data;
            }
          }
          sheet.cells = newCells;
        });
        get().engine.loadWorkbook(get().workbook);
      },

      deleteRow: (row) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const newCells: Record<string, CellData> = {};
          for (const [cellId, data] of Object.entries(sheet.cells)) {
            const ref = cellToRef(cellId);
            if (ref.row === row) continue;
            if (ref.row > row) {
              newCells[refToCell(ref.row - 1, ref.col)] = data;
            } else {
              newCells[cellId] = data;
            }
          }
          sheet.cells = newCells;
        });
        get().engine.loadWorkbook(get().workbook);
      },

      deleteColumn: (col) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const newCells: Record<string, CellData> = {};
          for (const [cellId, data] of Object.entries(sheet.cells)) {
            const ref = cellToRef(cellId);
            if (ref.col === col) continue;
            if (ref.col > col) {
              newCells[refToCell(ref.row, ref.col - 1)] = data;
            } else {
              newCells[cellId] = data;
            }
          }
          sheet.cells = newCells;
        });
        get().engine.loadWorkbook(get().workbook);
      },

      bulkSetCells: (cells) => {
        const state = get();
        for (const [cellId, data] of Object.entries(cells)) {
          // Skip AI formulas — they're handled by the AI registry, not Formualizer
          if (data.formula && state.engine.isAIFormula(data.formula)) continue;
          const ref = cellToRef(cellId);
          state.engine.setCellValue(state.activeSheetId, ref.row, ref.col, data.formula || data.value);
        }
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          for (const [cellId, data] of Object.entries(cells)) {
            if (!sheet.cells[cellId]) {
              sheet.cells[cellId] = { value: null };
            }
            sheet.cells[cellId].value = data.value;
            sheet.cells[cellId].formula = data.formula;
          }
          s.workbook.updatedAt = Date.now();
        });
      },

      importWorkbook: (workbook, _meta) => {
        // Data load only — chat/insights/audit side effects live in importOrchestration
        // and are applied by the composed store's importWorkbook wrapper.
        const eng = get().engine;
        eng.loadWorkbook(workbook);

        set((s) => {
          s.workbook = workbook;
          s.activeSheetId = workbook.activeSheetId;
          s.undoStack = [];
          s.redoStack = [];
          s.workbook.updatedAt = Date.now();
        });

        const state = get();
        const activeSheet = state.getActiveSheet();
        eng.executeAIFormulasForSheet(
          activeSheet.id,
          activeSheet.cells,
          (ref) => {
            const refPos = cellToRef(ref);
            return state.engine.getComputedValue(state.activeSheetId, refPos.row, refPos.col) || null;
          }
        );
      },

      loadWorkbookData: (workbook) => {
        const eng = get().engine;
        eng.loadWorkbook(workbook);

        set((s) => {
          s.workbook = workbook;
          s.activeSheetId = workbook.activeSheetId;
          s.undoStack = [];
          s.redoStack = [];
        });

        // Execute AI formulas for the active sheet after state is updated
        const state = get();
        const activeSheet = state.getActiveSheet();
        eng.executeAIFormulasForSheet(
          activeSheet.id,
          activeSheet.cells,
          (ref) => {
            const refPos = cellToRef(ref);
            return state.engine.getComputedValue(state.activeSheetId, refPos.row, refPos.col) || null;
          }
        );
      },

      getActiveSheet: () => {
        const state = get();
        return state.workbook.sheets.find((s) => s.id === state.activeSheetId) || state.workbook.sheets[0];
      },

      getCellData: (cellId) => {
        const sheet = get().getActiveSheet();
        return sheet.cells[cellId];
      },

      getComputedValue: (row, col) => {
        const state = get();
        const sheet = state.getActiveSheet();
        const cellId = refToCell(row, col);
        const cell = sheet.cells[cellId];

        // Route AI formulas - only return cached displayValue or placeholder
        if (cell?.formula && state.engine.isAIFormula(cell.formula)) {
          // If we already have a resolved displayValue, use it
          if (cell.displayValue !== undefined) {
            return cell.displayValue;
          }
          // Return loading placeholder - actual execution happens via explicit triggers
          return '⏳ Loading...';
        }

        return state.engine.getComputedValue(state.activeSheetId, row, col);
      }
  }
}

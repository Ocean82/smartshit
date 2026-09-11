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
import { mergeChartLayout } from '@/lib/chartLayout'
import { toMergeRange, parseMergeRange, rangesOverlap } from '@/lib/merge'
import { encodeCellBlock, parseGridClipboard } from '@/lib/clipboardCodec'
import { buildFillPattern, adjustFormulaRefs, fillCellAt, type FilledCell } from '@/lib/autofill'
import { buildRelocatePlan } from '@/lib/relocateRange'
import { buildAutoAggregatePlan, type AggregateFn } from '@/lib/autoAggregate'
import { clampRowHeight, getRowHeight, setRowAt, shiftRowHeightsOnDelete, shiftRowHeightsOnInsert } from '@/lib/rowLayout'
import { setHidden, shiftHiddenOnDelete, shiftHiddenOnInsert } from '@/lib/rowColVisibility'
import { autoFitRowHeights, createCanvasTextMeasurer } from '@/lib/rowAutoFit'
import { resolveHyperlinkOnEdit, type Hyperlink } from '@/lib/hyperlink'
import { MAX_UNDO_STACK } from '../storeTypes'
import { v4 as uuid } from 'uuid'

/** Convert raw clipboard text into a typed value suitable for setCellValue. */
function coerceValue(raw: string): string | number | boolean | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.toLowerCase() === 'true') return true
  if (trimmed.toLowerCase() === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return raw
}

/** Best-effort write of a cell block to the OS clipboard. Never throws. */
async function writeToOsClipboard(
  cells: Record<string, CellData>,
  selection: Selection,
): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') return
    const { tsv, csv, text } = encodeCellBlock(cells, selection)
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/tab-separated-values': new Blob([tsv], { type: 'text/tab-separated-values' }),
        'text/csv': new Blob([csv], { type: 'text/csv' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ])
  } catch {
    // Clipboard unavailable, not in a user gesture, or permission denied — non-fatal.
  }
}

export interface WorkbookSliceState {
  workbook: WorkbookData
  engine: SpreadsheetEngine
  activeSheetId: string
  selection: Selection | null
  editingCell: string | null
  editValue: string
  additionalSelections: Selection[]
  clipboard: { cells: Record<string, CellData>; selection: Selection; mode: 'copy' | 'cut' } | null
  copiedRange: Selection | null
  activeFilters: FilterConfig[]
  activeSortConfig: SortConfig | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  pushHistory: (desc: string) => void
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellHyperlink: (cellId: string, hyperlink: Hyperlink | null) => void
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
  deleteSelectedCells: () => void
  applySortPatch: (patch: SortPatch) => void
  copy: () => void
  cut: () => void
  paste: () => void
  pasteFromClipboard: () => Promise<void>
  clearClipboard: () => void
  autofillTo: (endRow: number, endCol: number) => void
  relocateRange: (args: { mode: 'move' | 'copy'; destRow: number; destCol: number }) => void
  applyAutoAggregate: (fn: AggregateFn) => void
  setRowHeight: (row: number, height: number) => void
  /** Autofit one or more rows to wrapped cell content (undoable). */
  autoFitRows: (rows: number[]) => void
  insertRow: (afterRow: number) => void
  deleteRow: (row: number) => void
  renameSheet: (sheetId: string, name: string) => void
  addSheet: (name?: string) => void
  duplicateSheet: (sheetId: string) => void
  moveSheet: (sheetId: string, toIndex: number) => void
  setSheetTabColor: (sheetId: string, color: string | null) => void
  hideSheet: (sheetId: string) => void
  unhideSheet: (sheetId: string) => void
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
  duplicateSheet: (sheetId: string) => void
  moveSheet: (sheetId: string, toIndex: number) => void
  setSheetTabColor: (sheetId: string, color: string | null) => void
  hideSheet: (sheetId: string) => void
  unhideSheet: (sheetId: string) => void
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellHyperlink: (cellId: string, hyperlink: Hyperlink | null) => void
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
  setRangeFormat: (format: Partial<CellFormat>) => void
  /** Strip CellFormat from the selection; keep value/formula/validation. */
  clearRangeFormat: () => void
  setSelection: (sel: Selection | null) => void
  addSelection: (sel: Selection) => void
  mergeSelection: (desc?: string) => void
  unmergeSelection: (desc?: string) => void
  setEditingCell: (cellId: string | null) => void
  setEditValue: (val: string) => void
  setCellValidation: (cellId: string, validation: DataValidation | null) => void
  validateCellValue: (cellId: string, value: string | number | null) => { valid: boolean; message?: string }
  copy: () => void
  cut: () => void
  paste: () => void
  pasteFromClipboard: () => Promise<void>
  clearClipboard: () => void
  autofillTo: (endRow: number, endCol: number) => void
  relocateRange: (args: { mode: 'move' | 'copy'; destRow: number; destCol: number }) => void
  applyAutoAggregate: (fn: AggregateFn) => void
  setRowHeight: (row: number, height: number) => void
  autoFitRows: (rows: number[]) => void
  addChart: (chart: ChartConfig) => void
  removeChart: (chartId: string) => void
  updateChartPosition: (chartId: string, x: number, y: number, size?: { width: number; height: number }) => void
  setFreeze: (rows: number, cols: number) => void
  hideRows: (rows: number[]) => void
  hideCols: (cols: number[]) => void
  unhideRows: (rows: number[]) => void
  unhideCols: (cols: number[]) => void
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
  loadWorkbookData: (workbook: WorkbookData, opts?: { pushUndo?: boolean }) => void
  getActiveSheet: () => SheetData
  getCellData: (cellId: string) => CellData | undefined
  getComputedValue: (row: number, col: number) => string
}

export function createWorkbookActions(
  set: (fn: (s: WorkbookSliceState) => void) => void,
  get: () => WorkbookSliceState,
): WorkbookActions {
  const measureWidth = createCanvasTextMeasurer()

  function fitWrappedRows(sheet: SheetData, rows: Iterable<number>) {
    const next = autoFitRowHeights(
      sheet,
      rows,
      (row, col) => {
        const computed = get().getComputedValue(row, col)
        if (computed) return computed
        const cell = sheet.cells[refToCell(row, col)]
        if (cell?.value == null) return ''
        return String(cell.value)
      },
      measureWidth,
    )
    sheet.rowHeights = next
  }

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

      duplicateSheet: (sheetId) => {
        const sheets = get().workbook.sheets;
        const idx = sheets.findIndex((sh) => sh.id === sheetId);
        if (idx < 0) return;
        const source = sheets[idx];
        const base = source.name;
        let name = `${base} (2)`;
        let n = 2;
        while (sheets.some((sh) => sh.name === name)) {
          n += 1;
          name = `${base} (${n})`;
        }
        const clone: SheetData = {
          ...structuredClone(source),
          id: uuid(),
          name,
          hidden: false,
        };
        get().pushHistory('Duplicate sheet');
        set((s) => {
          s.workbook.sheets.splice(idx + 1, 0, clone);
          s.activeSheetId = clone.id;
          s.workbook.activeSheetId = clone.id;
          s.workbook.updatedAt = Date.now();
        });
        get().engine.loadWorkbook(get().workbook);
      },

      moveSheet: (sheetId, toIndex) => {
        const sheets = get().workbook.sheets;
        const from = sheets.findIndex((sh) => sh.id === sheetId);
        if (from < 0) return;
        const to = Math.max(0, Math.min(sheets.length - 1, toIndex));
        if (from === to) return;
        get().pushHistory('Move sheet');
        set((s) => {
          const [sheet] = s.workbook.sheets.splice(from, 1);
          s.workbook.sheets.splice(to, 0, sheet);
          s.workbook.updatedAt = Date.now();
        });
        get().engine.loadWorkbook(get().workbook);
      },

      setSheetTabColor: (sheetId, color) => {
        get().pushHistory('Sheet tab color');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === sheetId);
          if (!sheet) return;
          if (color) sheet.tabColor = color;
          else delete sheet.tabColor;
          s.workbook.updatedAt = Date.now();
        });
      },

      hideSheet: (sheetId) => {
        const sheets = get().workbook.sheets;
        const sheet = sheets.find((sh) => sh.id === sheetId);
        if (!sheet || sheet.hidden) return;
        const visible = sheets.filter((sh) => !sh.hidden);
        if (visible.length <= 1) return;
        get().pushHistory('Hide sheet');
        set((s) => {
          const target = s.workbook.sheets.find((sh) => sh.id === sheetId);
          if (!target) return;
          target.hidden = true;
          if (s.activeSheetId === sheetId) {
            const next = s.workbook.sheets.find((sh) => !sh.hidden);
            if (next) {
              s.activeSheetId = next.id;
              s.workbook.activeSheetId = next.id;
            }
          }
          s.workbook.updatedAt = Date.now();
        });
      },

      unhideSheet: (sheetId) => {
        get().pushHistory('Unhide sheet');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === sheetId);
          if (!sheet) return;
          delete sheet.hidden;
          s.activeSheetId = sheet.id;
          s.workbook.activeSheetId = sheet.id;
          s.workbook.updatedAt = Date.now();
        });
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
            const prev = sheet.cells[cellId];
            if (!sheet.cells[cellId]) {
              sheet.cells[cellId] = { value: null };
            }
            const nextLink = resolveHyperlinkOnEdit({
              prevValue: prev?.value,
              prevHyperlink: prev?.hyperlink,
              nextValue: value,
              formula,
            });
            sheet.cells[cellId].value = value;
            sheet.cells[cellId].formula = formula;
            // Clear stale displayValue when formula changes
            if (isAI) {
              sheet.cells[cellId].displayValue = undefined;
            }
            if (nextLink) sheet.cells[cellId].hyperlink = nextLink;
            else delete sheet.cells[cellId].hyperlink;
          }
          // Grow/shrink wrapped rows with content (no extra history — undo
          // restores the pre-edit workbook snapshot including rowHeights).
          if (sheet.cells[cellId]?.format?.textWrap) {
            fitWrappedRows(sheet, [ref.row]);
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

      setCellHyperlink: (cellId, hyperlink) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          if (!hyperlink) {
            if (sheet.cells[cellId]) delete sheet.cells[cellId].hyperlink;
            return;
          }
          if (!sheet.cells[cellId]) sheet.cells[cellId] = { value: null };
          sheet.cells[cellId].hyperlink = hyperlink;
          s.workbook.updatedAt = Date.now();
        });
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
          if (sheet.cells[cellId].format?.textWrap) {
            fitWrappedRows(sheet, [cellToRef(cellId).row]);
          }
        });
      },

      setRangeFormat: (format) => {
        const sel = get().selection;
        if (!sel) return;
        get().pushHistory('Format cells');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const affectedRows = new Set<number>();
          // Apply to primary selection + any additional Ctrl+click ranges
          const allRanges = [sel, ...s.additionalSelections];
          for (const range of allRanges) {
            const minR = Math.min(range.startRow, range.endRow);
            const maxR = Math.max(range.startRow, range.endRow);
            const minC = Math.min(range.startCol, range.endCol);
            const maxC = Math.max(range.startCol, range.endCol);
            for (let r = minR; r <= maxR; r++) {
              affectedRows.add(r);
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
          // Enabling wrap (or changing size while wrap is on) autofits row heights.
          if (format.textWrap === true || format.fontSize !== undefined) {
            const rowsToFit = [...affectedRows].filter((r) => {
              // Any wrapped cell on the row is enough to trigger a fit pass.
              for (const [cid, cell] of Object.entries(sheet.cells)) {
                if (cellToRef(cid).row === r && cell.format?.textWrap) return true;
              }
              return false;
            });
            if (rowsToFit.length > 0) fitWrappedRows(sheet, rowsToFit);
          }
        });
      },

      clearRangeFormat: () => {
        const sel = get().selection;
        if (!sel) return;
        get().pushHistory('Clear formatting');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const allRanges = [sel, ...s.additionalSelections];
          for (const range of allRanges) {
            const minR = Math.min(range.startRow, range.endRow);
            const maxR = Math.max(range.startRow, range.endRow);
            const minC = Math.min(range.startCol, range.endCol);
            const maxC = Math.max(range.startCol, range.endCol);
            for (let r = minR; r <= maxR; r++) {
              for (let c = minC; c <= maxC; c++) {
                const cid = refToCell(r, c);
                const cell = sheet.cells[cid];
                if (!cell?.format) continue;
                delete cell.format;
              }
            }
          }
          s.workbook.updatedAt = Date.now();
        });
      },

      setSelection: (sel) => set((s) => { s.selection = sel; s.additionalSelections = []; }),
      addSelection: (sel: Selection) => set((s) => {
        if (s.selection) {
          s.additionalSelections = [...s.additionalSelections, s.selection];
        }
        s.selection = sel;
      }),
      mergeSelection: (desc) => {
        const sel = get().selection;
        if (!sel) return;
        const minR = Math.min(sel.startRow, sel.endRow);
        const maxR = Math.max(sel.startRow, sel.endRow);
        const minC = Math.min(sel.startCol, sel.endCol);
        const maxC = Math.max(sel.startCol, sel.endCol);
        const newRange = toMergeRange(minR, minC, maxR, maxC);
        if (!newRange) return;
        get().pushHistory(desc ?? 'Merge cells');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const parsedNew = parseMergeRange(newRange);
          if (!parsedNew) return;
          const existing = sheet.mergedCells ? [...sheet.mergedCells] : [];
          const remaining = existing.filter((ref) => {
            const parsed = parseMergeRange(ref);
            if (!parsed) return false;
            return !rangesOverlap(parsed, parsedNew);
          });
          remaining.push(newRange);
          sheet.mergedCells = remaining.sort();
          s.workbook.updatedAt = Date.now();
        });
      },

      unmergeSelection: (desc) => {
        const sel = get().selection;
        if (!sel) return;
        const minR = Math.min(sel.startRow, sel.endRow);
        const maxR = Math.max(sel.startRow, sel.endRow);
        const minC = Math.min(sel.startCol, sel.endCol);
        const maxC = Math.max(sel.startCol, sel.endCol);
        const selRange = { startRow: minR, startCol: minC, endRow: maxR, endCol: maxC };
        get().pushHistory(desc ?? 'Unmerge cells');
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          const existing = sheet.mergedCells ? [...sheet.mergedCells] : [];
          sheet.mergedCells = existing.filter((ref) => {
            const parsed = parseMergeRange(ref);
            if (!parsed) return false;
            return !rangesOverlap(parsed, selRange);
          });
          s.workbook.updatedAt = Date.now();
        });
      },
      setRowHeight: (row, height) => {
        if (row < 0) return;
        const sheet = get().getActiveSheet();
        const current = getRowHeight(sheet.rowHeights, row);
        const clamped = clampRowHeight(height);
        if (clamped === current) return;
        get().pushHistory('Row height');
        set((s) => {
          const sh = s.workbook.sheets.find((x) => x.id === s.activeSheetId);
          if (!sh) return;
          sh.rowHeights = setRowAt(sh.rowHeights, row, clamped);
          s.workbook.updatedAt = Date.now();
        });
      },

      autoFitRows: (rows) => {
        const unique = [...new Set(rows.filter((r) => r >= 0 && Number.isFinite(r)))];
        if (unique.length === 0) return;
        const sheet = get().getActiveSheet();
        const next = autoFitRowHeights(sheet, unique, (row, col) => {
          const computed = get().getComputedValue(row, col);
          if (computed) return computed;
          const cell = sheet.cells[refToCell(row, col)];
          if (cell?.value == null) return '';
          return String(cell.value);
        }, measureWidth);
        const meaningful = unique.some((r) => getRowHeight(next, r) !== getRowHeight(sheet.rowHeights, r));
        if (!meaningful) return;
        get().pushHistory(unique.length === 1 ? 'Autofit row height' : 'Autofit row heights');
        set((s) => {
          const sh = s.workbook.sheets.find((x) => x.id === s.activeSheetId);
          if (!sh) return;
          sh.rowHeights = next;
          s.workbook.updatedAt = Date.now();
        });
      },

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
        set((s) => { s.clipboard = { cells, selection: sel, mode: 'copy' }; s.copiedRange = sel; });
        void writeToOsClipboard(cells, sel);
      },

      cut: () => {
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
        set((s) => { s.clipboard = { cells, selection: sel, mode: 'cut' }; s.copiedRange = sel; });
        void writeToOsClipboard(cells, sel);
      },

      clearClipboard: () => {
        set((s) => { s.clipboard = null; s.copiedRange = null; });
      },

      paste: () => {
        const { clipboard, selection } = get();
        if (!clipboard || !selection) return;
        const isCut = clipboard.mode === 'cut';
        get().pushHistory(isCut ? 'Cut' : 'Paste');
        const srcMinR = Math.min(clipboard.selection.startRow, clipboard.selection.endRow);
        const srcMaxR = Math.max(clipboard.selection.startRow, clipboard.selection.endRow);
        const srcMinC = Math.min(clipboard.selection.startCol, clipboard.selection.endCol);
        const srcMaxC = Math.max(clipboard.selection.startCol, clipboard.selection.endCol);
        const dstR = Math.min(selection.startRow, selection.endRow);
        const dstC = Math.min(selection.startCol, selection.endCol);

        const destIds = new Set<string>();
        for (let r = srcMinR; r <= srcMaxR; r++) {
          for (let c = srcMinC; c <= srcMaxC; c++) {
            destIds.add(refToCell(r - srcMinR + dstR, c - srcMinC + dstC));
          }
        }
        for (const [cellId, cellData] of Object.entries(clipboard.cells)) {
          const ref = cellToRef(cellId);
          const newR = ref.row - srcMinR + dstR;
          const newC = ref.col - srcMinC + dstC;
          const newCellId = refToCell(newR, newC);
          get().setCellValue(newCellId, cellData.value, cellData.formula);
          if (cellData.format) {
            get().setCellFormat(newCellId, cellData.format);
          }
          // Always replace dest link (including clear) so paste cannot leave a stale labeled link.
          get().setCellHyperlink(newCellId, cellData.hyperlink ?? null);
        }

        if (isCut) {
          set((s) => {
            const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
            if (!sheet) return;
            for (let r = srcMinR; r <= srcMaxR; r++) {
              for (let c = srcMinC; c <= srcMaxC; c++) {
                const id = refToCell(r, c);
                if (destIds.has(id)) continue;
                const ref = cellToRef(id);
                s.engine.setCellValue(s.activeSheetId, ref.row, ref.col, null);
                delete sheet.cells[id];
              }
            }
            s.workbook.updatedAt = Date.now();
          });
          set((s) => { s.clipboard = null; s.copiedRange = null; });
        } else {
          set((s) => { s.copiedRange = null; });
        }
      },

      pasteFromClipboard: async () => {
        const { selection } = get();
        if (!selection) return;

        let text: string | null = null;
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          try {
            text = await navigator.clipboard.readText();
          } catch {
            text = null;
          }
        }

        if (text) {
          const format = text.includes('\t') ? 'tsv' : text.includes(',') ? 'csv' : 'text'
          const parsed = parseGridClipboard(text, format);
          if (parsed && parsed.cellRefs.length > 0) {
            const { selection: sel } = get();
            if (!sel) return;
            get().pushHistory('Paste');
            const dstR = Math.min(sel.startRow, sel.endRow);
            const dstC = Math.min(sel.startCol, sel.endCol);
            for (const [cellId, raw] of Object.entries(parsed.valuesByRef)) {
              const ref = cellToRef(cellId);
              const newCellId = refToCell(ref.row + dstR, ref.col + dstC);
              get().setCellValue(newCellId, coerceValue(raw));
            }
            // OS paste cancels pending cut without clearing the cut source.
            set((s) => { s.clipboard = null; s.copiedRange = null; });
            return;
          }
        }

        get().paste();
      },

      autofillTo: (dragRow, dragCol) => {
        const state = get();
        const sel = state.selection;
        if (!sel || state.editingCell) return;

        const sr0 = Math.min(sel.startRow, sel.endRow);
        const sr1 = Math.max(sel.startRow, sel.endRow);
        const sc0 = Math.min(sel.startCol, sel.endCol);
        const sc1 = Math.max(sel.startCol, sel.endCol);
        const endRow = Math.max(sr1, dragRow);
        const endCol = Math.max(sc1, dragCol);
        if (endRow <= sr1 && endCol <= sc1) return;

        const sheet = get().getActiveSheet();
        // Excel disables the fill handle when the destination touches a merge.
        if ((sheet.mergedCells?.length ?? 0) > 0) {
          const dest = { startRow: sr0, startCol: sc0, endRow, endCol };
          for (const ref of sheet.mergedCells ?? []) {
            const range = parseMergeRange(ref);
            if (range && rangesOverlap(range, dest)) return;
          }
        }

        get().pushHistory('Autofill');

        const read = (r: number, c: number): CellData | undefined =>
          get().getActiveSheet().cells[refToCell(r, c)];

        const applyCell = (r: number, c: number, filled: FilledCell, dr: number, dc: number) => {
          const id = refToCell(r, c);
          let formula = filled.formula;
          if (formula && (dr !== 0 || dc !== 0) && !get().engine.isAIFormula(formula)) {
            formula = adjustFormulaRefs(formula, dr, dc);
          }
          if (formula) get().setCellValue(id, filled.value ?? null, formula);
          else if (filled.value !== null) get().setCellValue(id, filled.value);
          if (filled.format) get().setCellFormat(id, filled.format);
          get().setCellHyperlink(id, filled.hyperlink ?? null);
        };

        // 1. Fill right: extend each source row across the new columns.
        for (let r = sr0; r <= sr1; r++) {
          const strip: Array<CellData | undefined> = [];
          for (let c = sc0; c <= sc1; c++) strip.push(read(r, c));
          const pattern = buildFillPattern(strip);
          for (let c = sc1 + 1; c <= endCol; c++) {
            const filled = fillCellAt(pattern, c - sc1);
            if (!filled) continue;
            applyCell(r, c, filled, 0, c - (sc0 + filled.sourceStripIndex));
          }
        }

        // 2. Fill down: extend each column (source, then freshly filled) downward.
        for (let c = sc0; c <= endCol; c++) {
          const strip: Array<CellData | undefined> = [];
          for (let r = sr0; r <= sr1; r++) strip.push(read(r, c));
          const pattern = buildFillPattern(strip);
          for (let r = sr1 + 1; r <= endRow; r++) {
            const filled = fillCellAt(pattern, r - sr1);
            if (!filled) continue;
            applyCell(r, c, filled, r - (sr0 + filled.sourceStripIndex), 0);
          }
        }

        set((s) => { s.selection = { startRow: sr0, startCol: sc0, endRow, endCol }; s.additionalSelections = []; });
      },

      relocateRange: ({ mode, destRow, destCol }) => {
        const state = get();
        const sel = state.selection;
        if (!sel || state.editingCell) return;

        const sheet = get().getActiveSheet();
        const plan = buildRelocatePlan({
          cells: sheet.cells,
          source: sel,
          destRow,
          destCol,
          mode,
        });
        if (!plan) return;

        get().pushHistory(mode === 'move' ? 'Move cells' : 'Copy cells');

        for (const { cellId, data } of plan.writes) {
          get().setCellValue(cellId, data.value, data.formula);
          if (data.format) get().setCellFormat(cellId, data.format);
          get().setCellHyperlink(cellId, data.hyperlink ?? null);
        }

        if (plan.clears.length > 0) {
          set((s) => {
            const active = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
            if (!active) return;
            for (const cellId of plan.clears) {
              const ref = cellToRef(cellId);
              s.engine.setCellValue(s.activeSheetId, ref.row, ref.col, null);
              delete active.cells[cellId];
            }
            s.workbook.updatedAt = Date.now();
          });
        }

        set((s) => {
          s.selection = plan.destSelection;
          s.additionalSelections = [];
        });
      },

      applyAutoAggregate: (fn) => {
        const sel = get().selection;
        if (!sel || get().editingCell) return;
        const plan = buildAutoAggregatePlan({
          selection: sel,
          fn,
          maxRow: 9999,
          maxCol: 99,
        });
        if (!plan) return;
        const label = fn === 'SUM' ? 'AutoSum' : `Auto${fn.charAt(0)}${fn.slice(1).toLowerCase()}`;
        get().pushHistory(label);
        for (const { cellId, formula } of plan.writes) {
          get().setCellValue(cellId, null, formula);
        }
        set((s) => {
          s.selection = plan.focus;
          s.additionalSelections = [];
        });
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

      updateChartPosition: (chartId, x, y, size) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (sheet && sheet.charts) {
            const chart = sheet.charts.find((c) => c.id === chartId);
            if (chart) {
              chart.position = mergeChartLayout(chart.position, { x, y, ...size });
            }
          }
        });
      },

      // Counts of leading display rows/cols to pin (post-filter indices in the grid UI).
      setFreeze: (rows, cols) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (sheet) {
            sheet.frozenRows = rows;
            sheet.frozenCols = cols;
          }
        });
      },

      hideRows: (rows) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet || rows.length === 0) return;
          const next = setHidden(sheet.hiddenRows, rows, true);
          if (Object.keys(next).length === 0) delete sheet.hiddenRows;
          else sheet.hiddenRows = next;
        });
      },

      hideCols: (cols) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet || cols.length === 0) return;
          const next = setHidden(sheet.hiddenCols, cols, true);
          if (Object.keys(next).length === 0) delete sheet.hiddenCols;
          else sheet.hiddenCols = next;
        });
      },

      unhideRows: (rows) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet || rows.length === 0) return;
          const next = setHidden(sheet.hiddenRows, rows, false);
          if (Object.keys(next).length === 0) delete sheet.hiddenRows;
          else sheet.hiddenRows = next;
        });
      },

      unhideCols: (cols) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet || cols.length === 0) return;
          const next = setHidden(sheet.hiddenCols, cols, false);
          if (Object.keys(next).length === 0) delete sheet.hiddenCols;
          else sheet.hiddenCols = next;
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
          sheet.rowHeights = shiftRowHeightsOnInsert(sheet.rowHeights, afterRow);
          sheet.hiddenRows = shiftHiddenOnInsert(sheet.hiddenRows, afterRow);
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
          sheet.hiddenCols = shiftHiddenOnInsert(sheet.hiddenCols, afterCol);
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
          sheet.rowHeights = shiftRowHeightsOnDelete(sheet.rowHeights, row);
          sheet.hiddenRows = shiftHiddenOnDelete(sheet.hiddenRows, row);
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
          sheet.hiddenCols = shiftHiddenOnDelete(sheet.hiddenCols, col);
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

      loadWorkbookData: (workbook, opts) => {
        const eng = get().engine;
        // When requested, snapshot the current workbook BEFORE replacing it so
        // the change is reversible via undo (Ctrl+Z).
        const beforeSnapshot =
          opts?.pushUndo ? structuredClone(get().workbook) : null;

        eng.loadWorkbook(workbook);

        set((s) => {
          s.workbook = workbook;
          s.activeSheetId = workbook.activeSheetId;
          if (opts?.pushUndo && beforeSnapshot) {
            // Structural patch referencing the pre-restore workbook makes
            // undo() restore the exact prior document, including cells,
            // layout, and undo-able history.
            s.undoStack.push({
              patch: {
                sheets: [],
                activeSheetIdBefore: beforeSnapshot.activeSheetId,
                activeSheetIdAfter: beforeSnapshot.activeSheetId,
                structuralBefore: beforeSnapshot,
              },
              description: 'Restore version',
            });
            if (s.undoStack.length > MAX_UNDO_STACK) s.undoStack.shift();
            s.redoStack = [];
          } else {
            s.undoStack = [];
            s.redoStack = [];
          }
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

        // For cells with formulas, use the engine's evaluation
        if (cell?.formula) {
          const engineVal = state.engine.getComputedValue(state.activeSheetId, row, col);
          // If the engine returns a valid result, use it; otherwise fall back to stored value
          if (engineVal !== '' && engineVal !== null && engineVal !== undefined) {
            return engineVal;
          }
          // Fallback: use stored value if engine can't evaluate
          return cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
        }

        // For plain-value cells, prefer the store's value (single source of truth after editing)
        // but consult the engine first in case something references this cell with a formula
        if (cell && cell.value !== null && cell.value !== undefined) {
          return String(cell.value);
        }

        return state.engine.getComputedValue(state.activeSheetId, row, col);
      }
  }
}

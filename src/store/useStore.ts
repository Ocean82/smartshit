import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  WorkbookData,
  SheetData,
  CellData,
  CellFormat,
  Selection,
  ChatMessage,
  AgentAction,
  FileItem,
  Skill,
  ChartConfig,
  FilterConfig,
  SortConfig,
  DataValidation,
} from '@/types';
import {
  createEmptyWorkbook,
  createEmptySheet,
  refToCell,
  cellToRef,
  SpreadsheetEngine,
} from '@/engine/spreadsheet';
import { parseMessage, executeTool, type ExecutionContext } from '@/agent';
import { loadPersistedState } from '@/lib/persistence';
import { processMessage } from '@/ai/brain';
import { buildSpreadsheetContext } from '@/ai/buildContext';
import { toolResultToChatMessage, toolResultToMessage } from '@/ai/responseBuilder';
import { buildFilePreview } from '@/ai/filePreview';
import { recordTelemetry } from '@/ai/telemetry';
import { classifyMode, isLlmOnlyMode, isBudgetExplainQuery } from '@/ai/mode';
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/skills/budget';
import { applyCleaningChanges, previewCleaning } from '@/ai/skills/cleaning';
import { parseUserIntent } from '@/ai/intentParser';
import { AI_ANALYSIS_CONFIG } from '@/ai/config';
import { resolveActTemplates } from '@shared/actTemplates';
import type { SheetInsights } from '@/ai/sheetInsights';
import type { AttachedFilePreview } from '@/ai/types';
import { computeSortedCellUpdates } from '@/lib/sheetSort';
import { findConditionalFormatTargets } from '@/lib/conditionalFormat';
import { v4 as uuid } from 'uuid';
import { defaultSkills } from '@/data/skills';

// History for undo/redo
interface HistoryEntry {
  workbook: string; // JSON snapshot
  description: string;
}

interface AppState {
  // Workbook
  workbook: WorkbookData;
  engine: SpreadsheetEngine;

  // UI State
  activeSheetId: string;
  selection: Selection | null;
  editingCell: string | null;
  editValue: string;
  showChat: boolean;
  showFileExplorer: boolean;
  showSkills: boolean;
  showChartDialog: boolean;
  showFormatPanel: boolean;
  showValidationDialog: boolean;
  showPivotDialog: boolean;
  setShowPivotDialog: (show: boolean) => void;
  contextMenu: { x: number; y: number; cell: string } | null;

  // History
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Files
  files: FileItem[];
  activeFileId: string | null;

  // Chat
  messages: ChatMessage[];
  chatInput: string;
  isAiProcessing: boolean;
  attachedFilePreview: AttachedFilePreview | null;

  // Skills
  skills: Skill[];

  // Clipboard
  clipboard: { cells: Record<string, CellData>; selection: Selection } | null;

  // Sort/Filter
  activeFilters: FilterConfig[];
  activeSortConfig: SortConfig | null;

  // Scroll position
  scrollRow: number;
  scrollCol: number;

  // Actions
  initWorkbook: (name?: string) => void;
  setActiveSheet: (sheetId: string) => void;
  addSheet: (name?: string) => void;
  deleteSheet: (sheetId: string) => void;
  renameSheet: (sheetId: string, name: string) => void;
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void;
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void;
  setRangeFormat: (format: Partial<CellFormat>) => void;
  setSelection: (sel: Selection | null) => void;
  setEditingCell: (cellId: string | null) => void;
  setEditValue: (val: string) => void;
  toggleChat: () => void;
  toggleFileExplorer: () => void;
  toggleSkills: () => void;
  setShowChartDialog: (v: boolean) => void;
  setShowFormatPanel: (v: boolean) => void;
  setShowValidationDialog: (show: boolean) => void;
  setContextMenu: (menu: { x: number; y: number; cell: string } | null) => void;

  // Validation
  setCellValidation: (cellId: string, validation: DataValidation | null) => void;
  validateCellValue: (cellId: string, value: string | number | null) => { valid: boolean; message?: string };

  // History
  pushHistory: (desc: string) => void;
  undo: () => void;
  redo: () => void;

  // Chat
  setChatInput: (val: string) => void;
  addMessage: (msg: ChatMessage) => void;
  sendMessage: () => void;
  attachFileForChat: (file: File) => Promise<void>;
  importAttachedFile: () => Promise<void>;
  clearAttachedFile: () => void;
  applyAction: (actionId: string) => void;
  rejectAction: (actionId: string) => void;

  // File system
  createFile: (name: string, parentId?: string | null) => void;
  createFolder: (name: string, parentId?: string | null) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, name: string) => void;
  openFile: (id: string) => void;

  // Clipboard
  copy: () => void;
  cut: () => void;
  paste: () => void;

  // Data operations
  addChart: (chart: ChartConfig) => void;
  removeChart: (chartId: string) => void;
  setSortConfig: (config: SortConfig | null) => void;
  setFilters: (filters: FilterConfig[]) => void;
  sortByColumn: (column: number, direction: 'asc' | 'desc') => void;
  applyConditionalFormat: (
    column: number,
    condition: string,
    color: string,
    threshold?: number,
  ) => void;
  showFilterDialog: boolean;
  setShowFilterDialog: (v: boolean) => void;
  showConditionalFormatDialog: boolean;
  setShowConditionalFormatDialog: (v: boolean) => void;
  deleteSelectedCells: () => void;
  insertRow: (afterRow: number) => void;
  insertColumn: (afterCol: number) => void;
  deleteRow: (row: number) => void;
  deleteColumn: (col: number) => void;

  // Bulk operations (for AI)
  bulkSetCells: (cells: Record<string, { value: string | number | boolean | null; formula?: string }>) => void;
  importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string }) => void;

  // Scroll
  setScrollPosition: (row: number, col: number) => void;

  // Get helpers
  getActiveSheet: () => SheetData;
  getCellData: (cellId: string) => CellData | undefined;
  getComputedValue: (row: number, col: number) => string;
}

export const useStore = create<AppState>()(
  immer((set, get) => {
    const engine = new SpreadsheetEngine();
    const persisted = loadPersistedState();
    const initialWorkbook = persisted?.workbook ?? createEmptyWorkbook('My Budget');

    const initialFile: FileItem = persisted?.files?.[0] ?? {
      id: uuid(),
      name: initialWorkbook.name,
      type: 'file',
      parentId: null,
      workbookId: initialWorkbook.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const defaultWelcome: ChatMessage = {
      id: uuid(),
      role: 'assistant',
      content: `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nI only apply changes after you review and approve them.`,
      timestamp: Date.now(),
    };

    return {
      workbook: initialWorkbook,
      engine,
      activeSheetId: initialWorkbook.activeSheetId,
      selection: null,
      editingCell: null,
      editValue: '',
      showChat: true,
      showFileExplorer: false,
      showSkills: false,
      showChartDialog: false,
      showFormatPanel: false,
      showValidationDialog: false,
      showPivotDialog: false,
      setShowPivotDialog: (show) => set({ showPivotDialog: show }),
      showFilterDialog: false,
      setShowFilterDialog: (v) => set({ showFilterDialog: v }),
      showConditionalFormatDialog: false,
      setShowConditionalFormatDialog: (v) => set({ showConditionalFormatDialog: v }),
      contextMenu: null,
      undoStack: [],
      redoStack: [],
      files: persisted?.files ?? [initialFile],
      activeFileId: persisted?.activeFileId ?? initialFile.id,
      messages: persisted?.messages?.length ? persisted.messages : [defaultWelcome],
      chatInput: '',
      isAiProcessing: false,
      attachedFilePreview: null,
      skills: defaultSkills,
      clipboard: null,
      activeFilters: [],
      activeSortConfig: null,
      scrollRow: 0,
      scrollCol: 0,

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
        set((s) => {
          if (s.workbook.sheets.length <= 1) return;
          s.workbook.sheets = s.workbook.sheets.filter((sh) => sh.id !== sheetId);
          if (s.activeSheetId === sheetId) {
            s.activeSheetId = s.workbook.sheets[0].id;
            s.workbook.activeSheetId = s.workbook.sheets[0].id;
          }
          s.workbook.updatedAt = Date.now();
        });
      },

      renameSheet: (sheetId, name) => {
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === sheetId);
          if (sheet) sheet.name = name;
          s.workbook.updatedAt = Date.now();
        });
      },

      setCellValue: (cellId, value, formula) => {
        const state = get();
        const ref = cellToRef(cellId);
        state.engine.setCellValue(state.activeSheetId, ref.row, ref.col, formula || value);
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
          }
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
        });
      },

      setRangeFormat: (format) => {
        const sel = get().selection;
        if (!sel) return;
        get().pushHistory('Format cells');
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
        });
      },

      setSelection: (sel) => set((s) => { s.selection = sel; }),
      setEditingCell: (cellId) => set((s) => { s.editingCell = cellId; }),
      setEditValue: (val) => set((s) => { s.editValue = val; }),
      toggleChat: () => set((s) => { s.showChat = !s.showChat; }),
      toggleFileExplorer: () => set((s) => { s.showFileExplorer = !s.showFileExplorer; }),
      toggleSkills: () => set((s) => { s.showSkills = !s.showSkills; }),
      setShowChartDialog: (v) => set((s) => { s.showChartDialog = v; }),
      setShowFormatPanel: (v) => set((s) => { s.showFormatPanel = v; }),
      setShowValidationDialog: (show) => set((s) => { s.showValidationDialog = show; }),
      setContextMenu: (menu) => set((s) => { s.contextMenu = menu; }),

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
        const v = cell.validation;
        const strVal = value == null ? '' : String(value);

        switch (v.type) {
          case 'number': {
            const num = Number(strVal);
            if (strVal !== '' && isNaN(num)) return { valid: false, message: v.message || 'Must be a number' };
            if (v.min != null && num < v.min) return { valid: false, message: v.message || `Must be ≥ ${v.min}` };
            if (v.max != null && num > v.max) return { valid: false, message: v.message || `Must be ≤ ${v.max}` };
            return { valid: true };
          }
          case 'list': {
            if (strVal !== '' && v.values && !v.values.includes(strVal))
              return { valid: false, message: v.message || `Must be one of: ${v.values.join(', ')}` };
            return { valid: true };
          }
          case 'text': {
            if (v.criteria === 'length' && v.min != null && strVal.length < v.min)
              return { valid: false, message: v.message || `Must be at least ${v.min} characters` };
            if (v.criteria === 'length' && v.max != null && strVal.length > v.max)
              return { valid: false, message: v.message || `Must be at most ${v.max} characters` };
            if (v.criteria === 'contains' && v.criteria && !strVal.includes(v.criteria))
              return { valid: false, message: v.message || `Must contain "${v.criteria}"` };
            return { valid: true };
          }
          case 'date': {
            if (strVal !== '' && isNaN(Date.parse(strVal)))
              return { valid: false, message: v.message || 'Must be a valid date' };
            return { valid: true };
          }
          case 'custom': {
            if (!v.criteria) return { valid: true };
            try {
              const fn = new Function('value', `return ${v.criteria}`);
              return fn(value) ? { valid: true } : { valid: false, message: v.message || 'Custom validation failed' };
            } catch {
              return { valid: true };
            }
          }
          default:
            return { valid: true };
        }
      },

      pushHistory: (desc) => {
        const snap = JSON.stringify(get().workbook);
        set((s) => {
          s.undoStack.push({ workbook: snap, description: desc });
          if (s.undoStack.length > 50) s.undoStack.shift();
          s.redoStack = [];
        });
      },

      undo: () => {
        const stack = get().undoStack;
        if (stack.length === 0) return;
        const currentSnap = JSON.stringify(get().workbook);
        const entry = stack[stack.length - 1];
        const wb: WorkbookData = JSON.parse(entry.workbook);
        const eng = get().engine;
        eng.loadWorkbook(wb);
        set((s) => {
          s.redoStack.push({ workbook: currentSnap, description: entry.description });
          s.undoStack.pop();
          s.workbook = wb;
          s.activeSheetId = wb.activeSheetId;
        });
      },

      redo: () => {
        const stack = get().redoStack;
        if (stack.length === 0) return;
        const currentSnap = JSON.stringify(get().workbook);
        const entry = stack[stack.length - 1];
        const wb: WorkbookData = JSON.parse(entry.workbook);
        const eng = get().engine;
        eng.loadWorkbook(wb);
        set((s) => {
          s.undoStack.push({ workbook: currentSnap, description: entry.description });
          s.redoStack.pop();
          s.workbook = wb;
          s.activeSheetId = wb.activeSheetId;
        });
      },

      setChatInput: (val) => set((s) => { s.chatInput = val; }),

      addMessage: (msg) => set((s) => { s.messages.push(msg); }),

      sendMessage: () => {
        const input = get().chatInput.trim();
        if (!input) return;

        const userMsg: ChatMessage = {
          id: uuid(),
          role: 'user',
          content: input,
          timestamp: Date.now(),
        };

        const streamingMsgId = uuid();
        const streamingMsg: ChatMessage = {
          id: streamingMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        };

        set((s) => {
          s.messages.push(userMsg);
          s.messages.push(streamingMsg);
          s.chatInput = '';
          s.isAiProcessing = true;
        });

        void (async () => {
          const state = get();
          const sheet = state.getActiveSheet();
          const history = state.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(0, -2)
            .slice(-8)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

          const priorInsights = state.messages
            .filter((m) => m.role === 'assistant' && m.insightsSnapshot)
            .at(-1)?.insightsSnapshot as SheetInsights | undefined;

          const context = buildSpreadsheetContext(
            state.workbook,
            sheet,
            state.selection,
            state.getComputedValue,
          );

          // ─── Agent Parser (instant, no LLM) ─────────────────────────────────
          const parsed = parseMessage(input);
          if (parsed.understood && parsed.calls.length > 0) {
            // Build execution context from store
            const execCtx: ExecutionContext = {
              getActiveSheet: get().getActiveSheet,
              getComputedValue: get().getComputedValue,
              setCellValue: get().setCellValue,
              setCellFormat: get().setCellFormat,
              bulkSetCells: get().bulkSetCells,
              deleteRow: get().deleteRow,
              insertRow: get().insertRow,
              addSheet: get().addSheet,
              renameSheet: get().renameSheet,
              pushHistory: get().pushHistory,
            };

            // Execute all tool calls in sequence
            const results = parsed.calls.map(call => executeTool(call, execCtx));
            const allSuccess = results.every(r => r.success);
            const totalModified = results.reduce((sum, r) => sum + r.modified, 0);

            // Build response message
            const messages = results.map(r => r.message);
            const explanation = parsed.explanation || messages.join('. ');
            const responseText = allSuccess
              ? `✓ ${explanation}${totalModified > 0 ? ` (${totalModified} cell${totalModified === 1 ? '' : 's'} modified)` : ''}`
              : `⚠️ ${messages.join('. ')}`;

            const agentMsg: ChatMessage = {
              id: streamingMsgId,
              role: 'assistant',
              content: responseText,
              timestamp: Date.now(),
            };

            set((s) => {
              const idx = s.messages.findIndex((m) => m.id === streamingMsgId);
              if (idx >= 0) s.messages[idx] = agentMsg;
              s.isAiProcessing = false;
            });
            return;
          }

          // ─── LLM Path (server-side AI for complex/open-ended requests) ──────
          const result = await processMessage({
            message: input,
            workbook: state.workbook,
            sheet,
            selection: state.selection,
            getComputedValue: state.getComputedValue,
            attachedPreview: state.attachedFilePreview,
            priorInsights: priorInsights ?? null,
            history,
            onToken: (token) => {
              set((s) => {
                const msg = s.messages.find((m) => m.id === streamingMsgId);
                if (msg) msg.content += token;
              });
            },
          });

          let finalMsg = toolResultToChatMessage(result, {
            id: streamingMsgId,
            insightsSnapshot: context.insights as unknown as Record<string, unknown>,
          });

          if (!result.success && !isLlmOnlyMode(classifyMode(input))) {
            finalMsg = { ...processAICommand(input, get), id: streamingMsgId };
          }

          set((s) => {
            const idx = s.messages.findIndex((m) => m.id === streamingMsgId);
            if (idx >= 0) s.messages[idx] = finalMsg;
            s.isAiProcessing = false;
          });
        })();
      },

      attachFileForChat: async (file) => {
        const maxBytes = AI_ANALYSIS_CONFIG.maxFileSizeMb * 1024 * 1024;
        if (file.size > maxBytes) {
          get().addMessage({
            id: uuid(),
            role: 'assistant',
            content: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${AI_ANALYSIS_CONFIG.maxFileSizeMb} MB.`,
            timestamp: Date.now(),
          });
          return;
        }

        try {
          const preview = await buildFilePreview(file, (workbook, row, col) => {
            const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0];
            const cellId = refToCell(row, col);
            const val = sheet.cells[cellId]?.value;
            return val === null || val === undefined ? '' : String(val);
          });
          if (preview.importWarnings?.length) {
            recordTelemetry('importTruncationEvents', `Chat attach: ${file.name}`);
          }
          set((s) => { s.attachedFilePreview = preview; });
        } catch {
          get().addMessage({
            id: uuid(),
            role: 'assistant',
            content: `Could not read **${file.name}**. Make sure it is a valid .xlsx or .csv file.`,
            timestamp: Date.now(),
          });
        }
      },

      importAttachedFile: async () => {
        const preview = get().attachedFilePreview;
        if (!preview) return;
        get().importWorkbook(preview.workbook, { fileName: preview.fileName });
        set((s) => { s.attachedFilePreview = null; });
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          content: `Imported **${preview.fileName}** into your workbook. Ask me to explain the data or build a budget from it.`,
          timestamp: Date.now(),
        });
      },

      clearAttachedFile: () => set((s) => { s.attachedFilePreview = null; }),

      applyAction: (actionId) => {
        const state = get();
        const highImpactTools = new Set([
          'clear_sheet',
          'clean_sheet_data',
          'modify_column',
        ]);
        // Find the action
        for (const msg of state.messages) {
          if (msg.actions) {
            const action = msg.actions.find((a) => a.id === actionId);
            if (action && action.status === 'pending') {
              const estimatedChanges = estimateActionChangeCount(action);
              const requiresPreview = highImpactTools.has(action.tool) && !action.preview;
              if (requiresPreview) {
                recordTelemetry('previewDeniedActions', action.tool);
                get().addMessage({
                  id: uuid(),
                  role: 'assistant',
                  content: `I need to show a preview before applying **${action.tool}** because it can affect many cells. Ask me to regenerate this action with a preview.`,
                  timestamp: Date.now(),
                });
                return;
              }

              const historyLabel = estimatedChanges > 0
                ? `AI Action: ${action.description} (~${estimatedChanges} changes)`
                : `AI Action: ${action.description}`;
              get().pushHistory(historyLabel);
              executeAction(action, get, set);
              set((s) => {
                for (const m of s.messages) {
                  if (m.actions) {
                    const a = m.actions.find((act) => act.id === actionId);
                    if (a) a.status = 'applied';
                  }
                }
              });
              break;
            }
          }
        }
      },

      rejectAction: (actionId) => {
        set((s) => {
          for (const msg of s.messages) {
            if (msg.actions) {
              const action = msg.actions.find((a) => a.id === actionId);
              if (action) action.status = 'rejected';
            }
          }
        });
      },

      createFile: (name, parentId = null) => {
        const wb = createEmptyWorkbook(name);
        const file: FileItem = {
          id: uuid(),
          name,
          type: 'file',
          parentId: parentId ?? null,
          workbookId: wb.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => { s.files.push(file); });
      },

      createFolder: (name, parentId = null) => {
        const folder: FileItem = {
          id: uuid(),
          name,
          type: 'folder',
          parentId: parentId ?? null,
          children: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => { s.files.push(folder); });
      },

      deleteFile: (id) => {
        set((s) => { s.files = s.files.filter((f) => f.id !== id); });
      },

      renameFile: (id, name) => {
        set((s) => {
          const file = s.files.find((f) => f.id === id);
          if (file) file.name = name;
        });
      },

      openFile: (id) => {
        set((s) => { s.activeFileId = id; });
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
        set((s) => { s.clipboard = { cells, selection: sel }; });
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

      setSortConfig: (config) => {
        set((s) => { s.activeSortConfig = config; });
      },

      setFilters: (filters) => {
        set((s) => { s.activeFilters = filters; });
      },

      sortByColumn: (column, direction) => {
        const sheet = get().getActiveSheet();
        get().pushHistory(`Sort by column ${column}`);
        const updates = computeSortedCellUpdates(
          sheet,
          column,
          direction,
          (row, col) => get().getComputedValue(row, col),
        );
        get().bulkSetCells(updates);
        set((s) => { s.activeSortConfig = { column, direction }; });
      },

      applyConditionalFormat: (column, condition, color, threshold = 0) => {
        const sheet = get().getActiveSheet();
        get().pushHistory(`Conditional format column ${column}`);
        const targets = findConditionalFormatTargets(
          column,
          condition,
          threshold,
          (row, col) => get().getComputedValue(row, col),
          Object.keys(sheet.cells),
          cellToRef,
        );
        for (const cellId of targets) {
          get().setCellFormat(cellId, { bgColor: color });
        }
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
      },

      bulkSetCells: (cells) => {
        const state = get();
        for (const [cellId, data] of Object.entries(cells)) {
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

      importWorkbook: (workbook, meta) => {
        const eng = get().engine;
        eng.loadWorkbook(workbook);
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0];
        const rowCount = sheet
          ? Object.keys(sheet.cells).length > 0
            ? Math.max(...Object.keys(sheet.cells).map((id) => cellToRef(id).row)) + 1
            : 0
          : 0;

        set((s) => {
          s.workbook = workbook;
          s.activeSheetId = workbook.activeSheetId;
          s.undoStack = [];
          s.redoStack = [];
          s.workbook.updatedAt = Date.now();

          const fileLabel = meta?.fileName ?? 'your file';
          s.messages.push({
            id: uuid(),
            role: 'assistant',
            content: `Imported **${fileLabel}** — ${rowCount} rows on **${sheet?.name ?? 'Sheet 1'}**.\n\nTry: **"Explain this spreadsheet"**, **"Where am I overspending?"**, or **"How much should I save monthly?"**`,
            timestamp: Date.now(),
          });
        });
      },

      setScrollPosition: (row, col) => {
        set((s) => { s.scrollRow = row; s.scrollCol = col; });
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
        return get().engine.getComputedValue(get().activeSheetId, row, col);
      },
    };
  })
);

// AI Command Processing (local fallback when server is unavailable)
function processAICommand(
  input: string,
  get: () => AppState
): ChatMessage {
  const mode = classifyMode(input);
  const lower = input.toLowerCase();
  const actions: AgentAction[] = [];

  if (mode === 'help') {
    return {
      id: uuid(),
      role: 'assistant',
      content: `Here's what I can do:\n\n**Understand your data**\n- "Explain this spreadsheet in plain English"\n- "Where am I overspending?"\n\n**Build spreadsheets**\n- "Create a monthly budget"\n- "Make a sales tracker"\n\nImport a file, then ask me about it.`,
      timestamp: Date.now(),
    };
  }

  if (isLlmOnlyMode(mode)) {
    const state = get();
    const sheet = state.getActiveSheet();
    const context = buildSpreadsheetContext(
      state.workbook,
      sheet,
      state.selection,
      state.getComputedValue,
    );
    const intent = parseUserIntent(input);
    const insights = context.insights;
    const monthlyIncome = typeof intent.parameters.monthlyIncome === 'number'
      ? intent.parameters.monthlyIncome
      : insights.totalIncome;

    if (mode === 'advise' && monthlyIncome && monthlyIncome > 0) {
      const result = savingsRecommendation(monthlyIncome, insights);
      return {
        id: uuid(),
        role: 'assistant',
        content: toolResultToMessage(result),
        timestamp: Date.now(),
        suggestions: result.suggestions,
      };
    }

    if (mode === 'advise' || (mode === 'explain' && isBudgetExplainQuery(input))) {
      const result = budgetAnalysisToToolResult(analyzeBudget(context.profile!, insights));
      return {
        id: uuid(),
        role: 'assistant',
        content: toolResultToMessage(result),
        timestamp: Date.now(),
        suggestions: result.suggestions,
        insightsSnapshot: insights as unknown as Record<string, unknown>,
      };
    }

    const parts: string[] = [`I would analyze your sheet **${context.activeSheet}** here, but the AI server is offline.`];

    if (insights.topExpenses?.length) {
      parts.push(`\nTop expenses I can see:\n${insights.topExpenses.slice(0, 5).map((e) => `- ${e.label}: $${e.amount}`).join('\n')}`);
    }
    if (insights.negativeVariances?.length) {
      parts.push(`\nOver budget:\n${insights.negativeVariances.slice(0, 5).map((v) => `- ${v.label}: ${v.difference}`).join('\n')}`);
    }
    if (insights.netCashflow !== undefined) {
      parts.push(`\nNet cashflow: $${insights.netCashflow}`);
    }

    parts.push('\nStart the server with `npm run dev:server` for a full AI answer.');
    return {
      id: uuid(),
      role: 'assistant',
      content: parts.join(''),
      timestamp: Date.now(),
    };
  }

  // Act mode — shared template resolver
  if (mode === 'act') {
    const template = resolveActTemplates(input);
    if (template.actions.length > 0 || template.message) {
      return {
        id: uuid(),
        role: 'assistant',
        content: template.message,
        timestamp: Date.now(),
        actions: template.actions.map((action) => ({
          id: uuid(),
          tool: action.tool,
          params: action.params,
          description: action.description,
          status: 'pending' as const,
        })),
      };
    }
  }

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return {
      id: uuid(),
      role: 'assistant',
      content: `Hello! I'm your **smartsh!t** assistant.\n\nI can help you build and manage budgets and spreadsheets using plain English. Try:\n\n- *"Create a monthly budget"*\n- *"Make a sales tracker"*\n- *"Create an invoice"*\n- *"Explain what this sheet means"*\n\nJust describe what you need!`,
      timestamp: Date.now(),
    };
  }

  if (lower.includes('help') || lower.includes('what can you do')) {
    return {
      id: uuid(),
      role: 'assistant',
      content: `Here's everything I can do:\n\n**Templates** — budget, sales tracker, invoice, KPI dashboard\n**Understand data** — explain budgets, find overspending, suggest savings\n**Build** — formulas, charts, formatting\n\nImport a file via the chat paperclip, then ask about it.`,
      timestamp: Date.now(),
    };
  }

  // Default helpful response
  return {
    id: uuid(),
    role: 'assistant',
    content: `I understand you want: *"${input}"*\n\nHere are some things I can do:\n\n📊 **Create templates**: "Create a monthly budget" / "Make a sales tracker"\n🔢 **Formulas**: "Calculate totals for column B" / "Add a SUM formula"\n📈 **Charts**: "Create a bar chart" / "Make a pie chart"\n🎨 **Format**: "Bold the header row" / "Color the cells"\n✏️ **Modify data**: "Add 10% to column B" / "Clear the sheet"\n👥 **Templates**: "Create employee roster" / "Project tracker"\n\nTry one of these commands!`,
    timestamp: Date.now(),
  };
}

function estimateActionChangeCount(action: AgentAction): number {
  const previewChanges = action.preview?.changes?.length ?? 0;
  if (previewChanges > 0) return previewChanges;

  if (action.tool === 'clean_sheet_data') {
    const preview = action.params.preview as { changes?: unknown[]; duplicateRows?: unknown[] } | undefined;
    const changeCount = preview?.changes?.length ?? 0;
    const duplicateCount = preview?.duplicateRows?.length ?? 0;
    return changeCount + duplicateCount;
  }

  if (action.tool === 'modify_column') return 50;
  if (action.tool === 'clear_sheet') return 200;
  if (action.tool.startsWith('create_')) return 100;

  return 0;
}

// Execute AI actions
function executeAction(
  action: AgentAction,
  get: () => AppState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _set: any
) {
  const state = get();
  const { tool, params } = action;

  switch (tool) {
    case 'create_budget_template': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: '💰 Monthly Budget' },
        'A3': { value: 'Category' },
        'B3': { value: 'Budgeted' },
        'C3': { value: 'Actual' },
        'D3': { value: 'Difference' },
        'A5': { value: '📥 INCOME' },
        'A6': { value: 'Salary' },
        'B6': { value: 5000 },
        'C6': { value: 5000 },
        'D6': { value: null, formula: '=C6-B6' },
        'A7': { value: 'Freelance' },
        'B7': { value: 1000 },
        'C7': { value: 1200 },
        'D7': { value: null, formula: '=C7-B7' },
        'A8': { value: 'Other Income' },
        'B8': { value: 200 },
        'C8': { value: 150 },
        'D8': { value: null, formula: '=C8-B8' },
        'A9': { value: 'Total Income' },
        'B9': { value: null, formula: '=SUM(B6:B8)' },
        'C9': { value: null, formula: '=SUM(C6:C8)' },
        'D9': { value: null, formula: '=C9-B9' },
        'A11': { value: '📤 EXPENSES' },
        'A12': { value: 'Housing/Rent' },
        'B12': { value: 1500 },
        'C12': { value: 1500 },
        'D12': { value: null, formula: '=C12-B12' },
        'A13': { value: 'Utilities' },
        'B13': { value: 200 },
        'C13': { value: 180 },
        'D13': { value: null, formula: '=C13-B13' },
        'A14': { value: 'Groceries' },
        'B14': { value: 400 },
        'C14': { value: 450 },
        'D14': { value: null, formula: '=C14-B14' },
        'A15': { value: 'Transportation' },
        'B15': { value: 150 },
        'C15': { value: 120 },
        'D15': { value: null, formula: '=C15-B15' },
        'A16': { value: 'Insurance' },
        'B16': { value: 300 },
        'C16': { value: 300 },
        'D16': { value: null, formula: '=C16-B16' },
        'A17': { value: 'Entertainment' },
        'B17': { value: 200 },
        'C17': { value: 250 },
        'D17': { value: null, formula: '=C17-B17' },
        'A18': { value: 'Savings' },
        'B18': { value: 500 },
        'C18': { value: 400 },
        'D18': { value: null, formula: '=C18-B18' },
        'A19': { value: 'Other' },
        'B19': { value: 100 },
        'C19': { value: 130 },
        'D19': { value: null, formula: '=C19-B19' },
        'A20': { value: 'Total Expenses' },
        'B20': { value: null, formula: '=SUM(B12:B19)' },
        'C20': { value: null, formula: '=SUM(C12:C19)' },
        'D20': { value: null, formula: '=C20-B20' },
        'A22': { value: '📊 NET BALANCE' },
        'B22': { value: null, formula: '=B9-B20' },
        'C22': { value: null, formula: '=C9-C20' },
        'D22': { value: null, formula: '=C22-B22' },
      };
      state.bulkSetCells(cells);
      // Apply formatting
      const headerFormat = { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF', textAlign: 'center' as const };
      state.setCellFormat('A3', headerFormat);
      state.setCellFormat('B3', headerFormat);
      state.setCellFormat('C3', headerFormat);
      state.setCellFormat('D3', headerFormat);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1E40AF' });
      state.setCellFormat('A5', { bold: true, fontColor: '#059669' });
      state.setCellFormat('A9', { bold: true, bgColor: '#ECFDF5' });
      state.setCellFormat('B9', { bold: true, bgColor: '#ECFDF5' });
      state.setCellFormat('C9', { bold: true, bgColor: '#ECFDF5' });
      state.setCellFormat('D9', { bold: true, bgColor: '#ECFDF5' });
      state.setCellFormat('A11', { bold: true, fontColor: '#DC2626' });
      state.setCellFormat('A20', { bold: true, bgColor: '#FEF2F2' });
      state.setCellFormat('B20', { bold: true, bgColor: '#FEF2F2' });
      state.setCellFormat('C20', { bold: true, bgColor: '#FEF2F2' });
      state.setCellFormat('D20', { bold: true, bgColor: '#FEF2F2' });
      state.setCellFormat('A22', { bold: true, fontSize: 14, fontColor: '#7C3AED' });
      state.setCellFormat('B22', { bold: true, bgColor: '#EDE9FE' });
      state.setCellFormat('C22', { bold: true, bgColor: '#EDE9FE' });
      state.setCellFormat('D22', { bold: true, bgColor: '#EDE9FE' });
      break;
    }

    case 'create_sales_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: '📈 Sales Tracker' },
        'A3': { value: 'Product' },
        'B3': { value: 'Category' },
        'C3': { value: 'Qty Sold' },
        'D3': { value: 'Unit Price' },
        'E3': { value: 'Revenue' },
        'F3': { value: 'Cost' },
        'G3': { value: 'Profit' },
        'A4': { value: 'Widget Pro' },
        'B4': { value: 'Hardware' },
        'C4': { value: 150 },
        'D4': { value: 29.99 },
        'E4': { value: null, formula: '=C4*D4' },
        'F4': { value: 12.50 },
        'G4': { value: null, formula: '=E4-(C4*F4)' },
        'A5': { value: 'Cloud Suite' },
        'B5': { value: 'Software' },
        'C5': { value: 85 },
        'D5': { value: 49.99 },
        'E5': { value: null, formula: '=C5*D5' },
        'F5': { value: 5.00 },
        'G5': { value: null, formula: '=E5-(C5*F5)' },
        'A6': { value: 'Data Pack' },
        'B6': { value: 'Service' },
        'C6': { value: 200 },
        'D6': { value: 19.99 },
        'E6': { value: null, formula: '=C6*D6' },
        'F6': { value: 8.00 },
        'G6': { value: null, formula: '=E6-(C6*F6)' },
        'A7': { value: 'Premium Plan' },
        'B7': { value: 'Subscription' },
        'C7': { value: 320 },
        'D7': { value: 9.99 },
        'E7': { value: null, formula: '=C7*D7' },
        'F7': { value: 2.00 },
        'G7': { value: null, formula: '=E7-(C7*F7)' },
        'A8': { value: 'Consulting' },
        'B8': { value: 'Service' },
        'C8': { value: 40 },
        'D8': { value: 150.00 },
        'E8': { value: null, formula: '=C8*D8' },
        'F8': { value: 60.00 },
        'G8': { value: null, formula: '=E8-(C8*F8)' },
        'A10': { value: 'TOTALS' },
        'C10': { value: null, formula: '=SUM(C4:C8)' },
        'E10': { value: null, formula: '=SUM(E4:E8)' },
        'G10': { value: null, formula: '=SUM(G4:G8)' },
        'A12': { value: 'Avg Revenue' },
        'B12': { value: null, formula: '=AVERAGE(E4:E8)' },
        'A13': { value: 'Max Revenue' },
        'B13': { value: null, formula: '=MAX(E4:E8)' },
        'A14': { value: 'Profit Margin' },
        'B14': { value: null, formula: '=G10/E10*100' },
      };
      state.bulkSetCells(cells);
      const headerFormat = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach(c => state.setCellFormat(c, headerFormat));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      ['A10','C10','E10','G10'].forEach(c => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    case 'create_employee_roster': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: '👥 Employee Roster' },
        'A3': { value: 'ID' },
        'B3': { value: 'Name' },
        'C3': { value: 'Department' },
        'D3': { value: 'Role' },
        'E3': { value: 'Email' },
        'F3': { value: 'Phone' },
        'G3': { value: 'Start Date' },
        'H3': { value: 'Salary' },
        'A4': { value: 'EMP001' },
        'B4': { value: 'Alice Johnson' },
        'C4': { value: 'Engineering' },
        'D4': { value: 'Senior Developer' },
        'E4': { value: 'alice@company.com' },
        'F4': { value: '555-0101' },
        'G4': { value: '2022-01-15' },
        'H4': { value: 95000 },
        'A5': { value: 'EMP002' },
        'B5': { value: 'Bob Smith' },
        'C5': { value: 'Marketing' },
        'D5': { value: 'Marketing Manager' },
        'E5': { value: 'bob@company.com' },
        'F5': { value: '555-0102' },
        'G5': { value: '2021-06-01' },
        'H5': { value: 85000 },
        'A6': { value: 'EMP003' },
        'B6': { value: 'Carol Davis' },
        'C6': { value: 'Design' },
        'D6': { value: 'UX Designer' },
        'E6': { value: 'carol@company.com' },
        'F6': { value: '555-0103' },
        'G6': { value: '2023-03-20' },
        'H6': { value: 78000 },
        'A7': { value: 'EMP004' },
        'B7': { value: 'David Lee' },
        'C7': { value: 'Engineering' },
        'D7': { value: 'DevOps Engineer' },
        'E7': { value: 'david@company.com' },
        'F7': { value: '555-0104' },
        'G7': { value: '2022-09-10' },
        'H7': { value: 92000 },
        'A9': { value: 'Total Employees' },
        'B9': { value: null, formula: '=COUNTA(A4:A7)' },
        'A10': { value: 'Avg Salary' },
        'B10': { value: null, formula: '=AVERAGE(H4:H7)' },
        'A11': { value: 'Total Payroll' },
        'B11': { value: null, formula: '=SUM(H4:H7)' },
      };
      state.bulkSetCells(cells);
      const headerFormat = { bold: true, bgColor: '#0369A1', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3','H3'].forEach(c => state.setCellFormat(c, headerFormat));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#0369A1' });
      break;
    }

    case 'create_project_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: '📋 Project Tracker' },
        'A3': { value: 'Task' },
        'B3': { value: 'Assignee' },
        'C3': { value: 'Priority' },
        'D3': { value: 'Status' },
        'E3': { value: 'Start Date' },
        'F3': { value: 'Due Date' },
        'G3': { value: 'Progress %' },
        'A4': { value: 'UI Design Mockups' },
        'B4': { value: 'Alice' },
        'C4': { value: 'High' },
        'D4': { value: 'In Progress' },
        'E4': { value: '2024-01-10' },
        'F4': { value: '2024-01-25' },
        'G4': { value: 75 },
        'A5': { value: 'Backend API' },
        'B5': { value: 'Bob' },
        'C5': { value: 'High' },
        'D5': { value: 'In Progress' },
        'E5': { value: '2024-01-15' },
        'F5': { value: '2024-02-01' },
        'G5': { value: 40 },
        'A6': { value: 'Database Schema' },
        'B6': { value: 'Carol' },
        'C6': { value: 'Medium' },
        'D6': { value: 'Complete' },
        'E6': { value: '2024-01-05' },
        'F6': { value: '2024-01-15' },
        'G6': { value: 100 },
        'A7': { value: 'Testing Suite' },
        'B7': { value: 'David' },
        'C7': { value: 'Medium' },
        'D7': { value: 'Not Started' },
        'E7': { value: '2024-02-01' },
        'F7': { value: '2024-02-15' },
        'G7': { value: 0 },
        'A8': { value: 'Documentation' },
        'B8': { value: 'Alice' },
        'C8': { value: 'Low' },
        'D8': { value: 'Not Started' },
        'E8': { value: '2024-02-10' },
        'F8': { value: '2024-02-20' },
        'G8': { value: 0 },
        'A10': { value: 'Overall Progress' },
        'B10': { value: null, formula: '=AVERAGE(G4:G8)' },
        'A11': { value: 'Tasks Complete' },
        'B11': { value: null, formula: '=COUNTIF(D4:D8,"Complete")' },
        'A12': { value: 'Total Tasks' },
        'B12': { value: null, formula: '=COUNTA(A4:A8)' },
      };
      state.bulkSetCells(cells);
      const headerFormat = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach(c => state.setCellFormat(c, headerFormat));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      break;
    }

    case 'apply_formula': {
      const col = (params.column as string) || 'B';
      const sheet = state.getActiveSheet();
      // Find max row with data in that column
      let maxRow = 0;
      for (const cellId of Object.keys(sheet.cells)) {
        if (cellId.startsWith(col)) {
          const ref = cellToRef(cellId);
          maxRow = Math.max(maxRow, ref.row);
        }
      }
      if (maxRow > 0) {
        const formulaCell = `${col}${maxRow + 2}`;
        state.setCellValue(formulaCell, null, `=SUM(${col}1:${col}${maxRow + 1})`);
        state.setCellFormat(formulaCell, { bold: true, bgColor: '#FEF3C7' });
        state.setCellValue(`A${maxRow + 2}`, 'Total');
        state.setCellFormat(`A${maxRow + 2}`, { bold: true });
      }
      break;
    }

    case 'format_cells': {
      const format: Partial<CellFormat> = {};
      if (params.bold) format.bold = true;
      if (params.bgColor) format.bgColor = params.bgColor as string;
      state.setRangeFormat(format);
      break;
    }

    case 'modify_column': {
      const col = (params.column as string) || 'B';
      const factor = (params.factor as number) || 1.1;
      const sheet = state.getActiveSheet();
      for (const [cellId, data] of Object.entries(sheet.cells)) {
        if (cellId.startsWith(col) && typeof data.value === 'number') {
          state.setCellValue(cellId, Math.round(data.value * factor * 100) / 100);
        }
      }
      break;
    }

    case 'create_chart': {
      const chartType = (params.type as string) || 'bar';
      state.addChart({
        id: uuid(),
        type: chartType as ChartConfig['type'],
        title: 'Data Chart',
        dataRange: 'A1:B10',
        position: { x: 50, y: 50, width: 400, height: 300 },
        colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
      });
      break;
    }

    case 'create_invoice': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: '🧾 INVOICE' },
        'A2': { value: 'Invoice #: INV-001' },
        'A3': { value: 'Date: 2024-01-15' },
        'A5': { value: 'From:' },
        'A6': { value: 'Your Company Name' },
        'A7': { value: '123 Business Ave' },
        'A8': { value: 'City, State 12345' },
        'D5': { value: 'Bill To:' },
        'D6': { value: 'Client Company' },
        'D7': { value: '456 Client Road' },
        'D8': { value: 'City, State 67890' },
        'A10': { value: 'Item' },
        'B10': { value: 'Description' },
        'C10': { value: 'Qty' },
        'D10': { value: 'Unit Price' },
        'E10': { value: 'Amount' },
        'A11': { value: 'Web Design' },
        'B11': { value: 'Homepage redesign' },
        'C11': { value: 1 },
        'D11': { value: 2500 },
        'E11': { value: null, formula: '=C11*D11' },
        'A12': { value: 'Development' },
        'B12': { value: 'Frontend coding' },
        'C12': { value: 40 },
        'D12': { value: 75 },
        'E12': { value: null, formula: '=C12*D12' },
        'A13': { value: 'SEO Setup' },
        'B13': { value: 'Initial optimization' },
        'C13': { value: 1 },
        'D13': { value: 500 },
        'E13': { value: null, formula: '=C13*D13' },
        'A14': { value: 'Hosting' },
        'B14': { value: 'Annual hosting plan' },
        'C14': { value: 12 },
        'D14': { value: 25 },
        'E14': { value: null, formula: '=C14*D14' },
        'D16': { value: 'Subtotal' },
        'E16': { value: null, formula: '=SUM(E11:E14)' },
        'D17': { value: 'Tax (10%)' },
        'E17': { value: null, formula: '=E16*0.1' },
        'D18': { value: 'TOTAL' },
        'E18': { value: null, formula: '=E16+E17' },
        'A20': { value: 'Payment Terms: Net 30' },
        'A21': { value: 'Thank you for your business!' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 24, fontColor: '#1E40AF' });
      const headerFormat = { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A10', 'B10', 'C10', 'D10', 'E10'].forEach(c => state.setCellFormat(c, headerFormat));
      state.setCellFormat('A5', { bold: true });
      state.setCellFormat('D5', { bold: true });
      state.setCellFormat('D16', { bold: true, textAlign: 'right' });
      state.setCellFormat('D17', { bold: true, textAlign: 'right' });
      state.setCellFormat('D18', { bold: true, fontSize: 14, textAlign: 'right' });
      state.setCellFormat('E18', { bold: true, fontSize: 14, bgColor: '#DBEAFE' });
      state.setCellFormat('E16', { bold: true });
      state.setCellFormat('A21', { italic: true, fontColor: '#6B7280' });
      break;
    }

    case 'clean_sheet_data': {
      const preview = params.preview as import('@/ai/skills/cleaning').CleaningPreview | undefined;
      const cleaning = preview ?? previewCleaning(state.getActiveSheet());
      const { cellUpdates, rowsToDelete } = applyCleaningChanges(state.getActiveSheet(), cleaning);
      state.bulkSetCells(cellUpdates);
      for (const row of rowsToDelete) {
        get().deleteRow(row);
      }
      break;
    }

    case 'create_kpi_dashboard': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'KPI Dashboard' },
        'A3': { value: 'Metric' },
        'B3': { value: 'Target' },
        'C3': { value: 'Actual' },
        'D3': { value: 'Status' },
        'A4': { value: 'Revenue' },
        'B4': { value: 100000 },
        'C4': { value: 92000 },
        'D4': { value: 'Behind' },
        'A5': { value: 'New Customers' },
        'B5': { value: 50 },
        'C5': { value: 58 },
        'D5': { value: 'On Track' },
        'A6': { value: 'Churn Rate %' },
        'B6': { value: 5 },
        'C6': { value: 4.2 },
        'D6': { value: 'On Track' },
        'A7': { value: 'NPS' },
        'B7': { value: 70 },
        'C7': { value: 72 },
        'D7': { value: 'On Track' },
        'A9': { value: 'Summary' },
        'B9': { value: null, formula: '=COUNTIF(D4:D7,"On Track")' },
        'C9': { value: 'metrics on track' },
      };
      state.bulkSetCells(cells);
      const headerFormat = { bold: true, bgColor: '#0F766E', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3', 'B3', 'C3', 'D3'].forEach((c) => state.setCellFormat(c, headerFormat));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#0F766E' });
      break;
    }

    case 'create_expense_report': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Expense Report' },
        'A2': { value: 'Employee: __________' },
        'A3': { value: 'Period: __________' },
        'A5': { value: 'Date' },
        'B5': { value: 'Category' },
        'C5': { value: 'Description' },
        'D5': { value: 'Amount' },
        'E5': { value: 'Approved' },
        'A6': { value: '2024-01-05' },
        'B6': { value: 'Travel' },
        'C6': { value: 'Client meeting' },
        'D6': { value: 245.5 },
        'E6': { value: 'Yes' },
        'A7': { value: '2024-01-12' },
        'B7': { value: 'Meals' },
        'C7': { value: 'Team lunch' },
        'D7': { value: 86.2 },
        'E7': { value: 'Yes' },
        'A8': { value: '2024-01-18' },
        'B8': { value: 'Supplies' },
        'C8': { value: 'Office materials' },
        'D8': { value: 42 },
        'E8': { value: 'Pending' },
        'A10': { value: 'Total' },
        'D10': { value: null, formula: '=SUM(D6:D8)' },
      };
      state.bulkSetCells(cells);
      const headerFormat = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A5', 'B5', 'C5', 'D5', 'E5'].forEach((c) => state.setCellFormat(c, headerFormat));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A10', { bold: true });
      state.setCellFormat('D10', { bold: true, bgColor: '#FEF3C7' });
      break;
    }


    // ═══════════════════════════════════════════════════════════════════════════════
    // PERSONAL FINANCE TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════════

    case 'create_wedding_budget': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Wedding Budget' },
        'A2': { value: 'Total Budget: __________' },
        'A4': { value: 'Category' }, 'B4': { value: 'Vendor' }, 'C4': { value: 'Estimated' }, 'D4': { value: 'Actual' }, 'E4': { value: 'Difference' }, 'F4': { value: 'Deposit Paid' }, 'G4': { value: 'Balance Due' },
        'A5': { value: 'Venue' }, 'C5': { value: 5000 }, 'D5': { value: 0 }, 'E5': { value: null, formula: '=C5-D5' }, 'F5': { value: 0 }, 'G5': { value: null, formula: '=D5-F5' },
        'A6': { value: 'Catering' }, 'C6': { value: 4000 }, 'D6': { value: 0 }, 'E6': { value: null, formula: '=C6-D6' }, 'F6': { value: 0 }, 'G6': { value: null, formula: '=D6-F6' },
        'A7': { value: 'Photography' }, 'C7': { value: 2500 }, 'D7': { value: 0 }, 'E7': { value: null, formula: '=C7-D7' }, 'F7': { value: 0 }, 'G7': { value: null, formula: '=D7-F7' },
        'A8': { value: 'Flowers' }, 'C8': { value: 1500 }, 'D8': { value: 0 }, 'E8': { value: null, formula: '=C8-D8' }, 'F8': { value: 0 }, 'G8': { value: null, formula: '=D8-F8' },
        'A9': { value: 'Music/DJ' }, 'C9': { value: 1200 }, 'D9': { value: 0 }, 'E9': { value: null, formula: '=C9-D9' }, 'F9': { value: 0 }, 'G9': { value: null, formula: '=D9-F9' },
        'A10': { value: 'Attire' }, 'C10': { value: 2000 }, 'D10': { value: 0 }, 'E10': { value: null, formula: '=C10-D10' }, 'F10': { value: 0 }, 'G10': { value: null, formula: '=D10-F10' },
        'A12': { value: 'TOTAL' },
        'C12': { value: null, formula: '=SUM(C5:C10)' }, 'D12': { value: null, formula: '=SUM(D5:D10)' }, 'E12': { value: null, formula: '=SUM(E5:E10)' }, 'F12': { value: null, formula: '=SUM(F5:F10)' }, 'G12': { value: null, formula: '=SUM(G5:G10)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A4','B4','C4','D4','E4','F4','G4'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A12', { bold: true });
      ['C12','D12','E12','F12','G12'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    case 'create_student_loan_payoff': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Student Loan Payoff Tracker' },
        'A3': { value: 'Loan Name' }, 'B3': { value: 'Balance' }, 'C3': { value: 'Interest Rate' }, 'D3': { value: 'Min Payment' }, 'E3': { value: 'Extra Payment' }, 'F3': { value: 'Total Payment' }, 'G3': { value: 'Payoff Date' }, 'H3': { value: 'Total Interest' },
        'A4': { value: 'Federal Subsidized' }, 'B4': { value: 15000 }, 'C4': { value: 0.045 }, 'D4': { value: 200 }, 'E4': { value: 100 }, 'F4': { value: null, formula: '=D4+E4' }, 'G4': { value: '2028-06' }, 'H4': { value: 2100 },
        'A5': { value: 'Federal Unsubsidized' }, 'B5': { value: 20000 }, 'C5': { value: 0.065 }, 'D5': { value: 280 }, 'E5': { value: 0 }, 'F5': { value: null, formula: '=D5+E5' }, 'G5': { value: '2030-12' }, 'H5': { value: 5200 },
        'A6': { value: 'Private Loan' }, 'B6': { value: 10000 }, 'C6': { value: 0.08 }, 'D6': { value: 150 }, 'E6': { value: 50 }, 'F6': { value: null, formula: '=D6+E6' }, 'G6': { value: '2027-09' }, 'H6': { value: 1800 },
        'A8': { value: 'TOTALS' },
        'B8': { value: null, formula: '=SUM(B4:B6)' }, 'D8': { value: null, formula: '=SUM(D4:D6)' }, 'E8': { value: null, formula: '=SUM(E4:E6)' }, 'F8': { value: null, formula: '=SUM(F4:F6)' }, 'H8': { value: null, formula: '=SUM(H4:H6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#059669', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3','H3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      state.setCellFormat('A8', { bold: true });
      ['B8','D8','E8','F8','H8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#D1FAE5' }));
      break;
    }

    case 'create_retirement_calculator': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Retirement Calculator' },
        'A3': { value: 'Current Age' }, 'B3': { value: 30 },
        'A4': { value: 'Retirement Age' }, 'B4': { value: 65 },
        'A5': { value: 'Current Savings' }, 'B5': { value: 50000 },
        'A6': { value: 'Monthly Contribution' }, 'B6': { value: 500 },
        'A7': { value: 'Annual Return %' }, 'B7': { value: 0.07 },
        'A8': { value: 'Inflation %' }, 'B8': { value: 0.03 },
        'A10': { value: 'Years to Retirement' }, 'B10': { value: null, formula: '=B4-B3' },
        'A11': { value: 'Total Contributions' }, 'B11': { value: null, formula: '=B5+(B10*12*B6)' },
        'A12': { value: 'Projected Nest Egg' }, 'B12': { value: null, formula: '=B5*((1+B7)^B10)+B6*(((1+B7)^B10-1)/B7)*12' },
        'A13': { value: 'Real Return %' }, 'B13': { value: null, formula: '=B7-B8' },
        'A14': { value: 'Inflation-Adjusted Value' }, 'B14': { value: null, formula: '=B12/((1+B8)^B10)' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      ['A3','A4','A5','A6','A7','A8','A10','A11','A12','A13','A14'].forEach((c) => state.setCellFormat(c, { bold: true }));
      ['B10','B11','B12','B13','B14'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#D1FAE5' }));
      break;
    }

    case 'create_emergency_fund': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Emergency Fund Tracker' },
        'A2': { value: 'Goal: 3-6 months of expenses' },
        'A4': { value: 'Monthly Expenses' }, 'B4': { value: 3000 },
        'A5': { value: 'Target (3 months)' }, 'B5': { value: null, formula: '=B4*3' },
        'A6': { value: 'Target (6 months)' }, 'B6': { value: null, formula: '=B4*6' },
        'A8': { value: 'Month' }, 'B8': { value: 'Contribution' }, 'C8': { value: 'Balance' }, 'D8': { value: '% of Goal' },
        'A9': { value: 'Jan' }, 'B9': { value: 500 }, 'C9': { value: 500 }, 'D9': { value: null, formula: '=C9/$B$6' },
        'A10': { value: 'Feb' }, 'B10': { value: 500 }, 'C10': { value: null, formula: '=C9+B10' }, 'D10': { value: null, formula: '=C10/$B$6' },
        'A11': { value: 'Mar' }, 'B11': { value: 500 }, 'C11': { value: null, formula: '=C10+B11' }, 'D11': { value: null, formula: '=C11/$B$6' },
        'A12': { value: 'Apr' }, 'B12': { value: 500 }, 'C12': { value: null, formula: '=C11+B12' }, 'D12': { value: null, formula: '=C12/$B$6' },
        'A13': { value: 'May' }, 'B13': { value: 500 }, 'C13': { value: null, formula: '=C12+B13' }, 'D13': { value: null, formula: '=C13/$B$6' },
        'A14': { value: 'Jun' }, 'B14': { value: 500 }, 'C14': { value: null, formula: '=C13+B14' }, 'D14': { value: null, formula: '=C14/$B$6' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#059669', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A8','B8','C8','D8'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      ['A2','A5','A6'].forEach((c) => state.setCellFormat(c, { italic: true }));
      break;
    }

    case 'create_debt_snowball': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Debt Snowball Tracker' },
        'A2': { value: 'List debts smallest to largest balance' },
        'A4': { value: 'Debt Name' }, 'B4': { value: 'Balance' }, 'C4': { value: 'Interest Rate' }, 'D4': { value: 'Min Payment' }, 'E4': { value: 'Extra Payment' }, 'F4': { value: 'Payoff Order' },
        'A5': { value: 'Credit Card A' }, 'B5': { value: 1200 }, 'C5': { value: 0.1999 }, 'D5': { value: 50 }, 'E5': { value: 100 }, 'F5': { value: 1 },
        'A6': { value: 'Credit Card B' }, 'B6': { value: 3500 }, 'C6': { value: 0.1799 }, 'D6': { value: 70 }, 'E6': { value: 0 }, 'F6': { value: 2 },
        'A7': { value: 'Car Loan' }, 'B7': { value: 8000 }, 'C7': { value: 0.055 }, 'D7': { value: 200 }, 'E7': { value: 0 }, 'F7': { value: 3 },
        'A8': { value: 'Student Loan' }, 'B8': { value: 15000 }, 'C8': { value: 0.045 }, 'D8': { value: 250 }, 'E8': { value: 0 }, 'F8': { value: 4 },
        'A10': { value: 'TOTALS' },
        'B10': { value: null, formula: '=SUM(B5:B8)' }, 'D10': { value: null, formula: '=SUM(D5:D8)' }, 'E10': { value: null, formula: '=SUM(E5:E8)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#059669', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A4','B4','C4','D4','E4','F4'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      state.setCellFormat('A2', { italic: true, fontColor: '#6B7280' });
      state.setCellFormat('A10', { bold: true });
      ['B10','D10','E10'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#D1FAE5' }));
      break;
    }

    case 'create_savings_goal': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Savings Goal Tracker' },
        'A3': { value: 'Goal Name' }, 'B3': { value: 'Vacation Fund' },
        'A4': { value: 'Target Amount' }, 'B4': { value: 5000 },
        'A5': { value: 'Start Date' }, 'B5': { value: '2024-01-01' },
        'A6': { value: 'Target Date' }, 'B6': { value: '2024-12-31' },
        'A8': { value: 'Month' }, 'B8': { value: 'Deposit' }, 'C8': { value: 'Running Total' }, 'D8': { value: '% Complete' }, 'E8': { value: 'Remaining' },
        'A9': { value: 'Jan' }, 'B9': { value: 400 }, 'C9': { value: 400 }, 'D9': { value: null, formula: '=C9/$B$4' }, 'E9': { value: null, formula: '=$B$4-C9' },
        'A10': { value: 'Feb' }, 'B10': { value: 400 }, 'C10': { value: null, formula: '=C9+B10' }, 'D10': { value: null, formula: '=C10/$B$4' }, 'E10': { value: null, formula: '=$B$4-C10' },
        'A11': { value: 'Mar' }, 'B11': { value: 400 }, 'C11': { value: null, formula: '=C10+B11' }, 'D11': { value: null, formula: '=C11/$B$4' }, 'E11': { value: null, formula: '=$B$4-C11' },
        'A12': { value: 'Apr' }, 'B12': { value: 400 }, 'C12': { value: null, formula: '=C11+B12' }, 'D12': { value: null, formula: '=C12/$B$4' }, 'E12': { value: null, formula: '=$B$4-C12' },
        'A13': { value: 'May' }, 'B13': { value: 400 }, 'C13': { value: null, formula: '=C12+B13' }, 'D13': { value: null, formula: '=C13/$B$4' }, 'E13': { value: null, formula: '=$B$4-C13' },
        'A14': { value: 'Jun' }, 'B14': { value: 400 }, 'C14': { value: null, formula: '=C13+B14' }, 'D14': { value: null, formula: '=C14/$B$4' }, 'E14': { value: null, formula: '=$B$4-C14' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#059669', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A8','B8','C8','D8','E8'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      break;
    }

    case 'create_net_worth_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Net Worth Tracker' },
        'A3': { value: 'ASSETS' }, 'C3': { value: 'Amount' },
        'A4': { value: 'Checking Account' }, 'C4': { value: 5000 },
        'A5': { value: 'Savings Account' }, 'C5': { value: 15000 },
        'A6': { value: 'Investments' }, 'C6': { value: 45000 },
        'A7': { value: 'Retirement (401k/IRA)' }, 'C7': { value: 80000 },
        'A8': { value: 'Home Value' }, 'C8': { value: 250000 },
        'A9': { value: 'Car Value' }, 'C9': { value: 12000 },
        'A10': { value: 'Other Assets' }, 'C10': { value: 5000 },
        'A11': { value: 'TOTAL ASSETS' }, 'C11': { value: null, formula: '=SUM(C4:C10)' },
        'A13': { value: 'LIABILITIES' },
        'A14': { value: 'Mortgage' }, 'C14': { value: 180000 },
        'A15': { value: 'Car Loan' }, 'C15': { value: 8000 },
        'A16': { value: 'Student Loans' }, 'C16': { value: 25000 },
        'A17': { value: 'Credit Cards' }, 'C17': { value: 3000 },
        'A18': { value: 'Other Debts' }, 'C18': { value: 0 },
        'A19': { value: 'TOTAL LIABILITIES' }, 'C19': { value: null, formula: '=SUM(C14:C18)' },
        'A21': { value: 'NET WORTH' }, 'C21': { value: null, formula: '=C11-C19' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      ['A3','C3'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#059669', fontColor: '#FFFFFF' }));
      ['A13','A21'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DC2626', fontColor: '#FFFFFF' }));
      state.setCellFormat('C11', { bold: true, bgColor: '#D1FAE5' });
      state.setCellFormat('C19', { bold: true, bgColor: '#FEE2E2' });
      state.setCellFormat('C21', { bold: true, fontSize: 14, bgColor: '#D1FAE5', fontColor: '#059669' });
      break;
    }

    case 'create_holiday_budget': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Holiday Gift Budget' },
        'A2': { value: 'Total Budget: __________' },
        'A4': { value: 'Recipient' }, 'B4': { value: 'Relationship' }, 'C4': { value: 'Budget' }, 'D4': { value: 'Spent' }, 'E4': { value: 'Remaining' }, 'F4': { value: 'Gift Idea' },
        'A5': { value: 'Mom' }, 'B5': { value: 'Parent' }, 'C5': { value: 100 }, 'D5': { value: 75 }, 'E5': { value: null, formula: '=C5-D5' }, 'F5': { value: 'Sweater' },
        'A6': { value: 'Dad' }, 'B6': { value: 'Parent' }, 'C6': { value: 100 }, 'D6': { value: 0 }, 'E6': { value: null, formula: '=C6-D6' }, 'F6': { value: 'Book set' },
        'A7': { value: 'Sister' }, 'B7': { value: 'Sibling' }, 'C7': { value: 50 }, 'D7': { value: 30 }, 'E7': { value: null, formula: '=C7-D7' }, 'F7': { value: 'Candle set' },
        'A8': { value: 'Best Friend' }, 'B8': { value: 'Friend' }, 'C8': { value: 40 }, 'D8': { value: 0 }, 'E8': { value: null, formula: '=C8-D8' },
        'A9': { value: 'Coworker' }, 'B9': { value: 'Work' }, 'C9': { value: 25 }, 'D9': { value: 0 }, 'E9': { value: null, formula: '=C9-D9' },
        'A11': { value: 'TOTAL' },
        'C11': { value: null, formula: '=SUM(C5:C9)' }, 'D11': { value: null, formula: '=SUM(D5:D9)' }, 'E11': { value: null, formula: '=SUM(E5:E9)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#DC2626', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A4','B4','C4','D4','E4','F4'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#DC2626' });
      state.setCellFormat('A11', { bold: true });
      ['C11','D11','E11'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEE2E2' }));
      break;
    }

    case 'create_travel_budget': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Travel Budget Planner' },
        'A2': { value: 'Trip: __________' },
        'A3': { value: 'Dates: __________' },
        'A5': { value: 'Category' }, 'B5': { value: 'Estimated' }, 'C5': { value: 'Actual' }, 'D5': { value: 'Difference' }, 'E5': { value: 'Notes' },
        'A6': { value: 'Flights' }, 'B6': { value: 800 }, 'C6': { value: 0 }, 'D6': { value: null, formula: '=B6-C6' },
        'A7': { value: 'Hotel' }, 'B7': { value: 1200 }, 'C7': { value: 0 }, 'D7': { value: null, formula: '=B7-C7' },
        'A8': { value: 'Car Rental' }, 'B8': { value: 300 }, 'C8': { value: 0 }, 'D8': { value: null, formula: '=B8-C8' },
        'A9': { value: 'Food' }, 'B9': { value: 500 }, 'C9': { value: 0 }, 'D9': { value: null, formula: '=B9-C9' },
        'A10': { value: 'Activities' }, 'B10': { value: 400 }, 'C10': { value: 0 }, 'D10': { value: null, formula: '=B10-C10' },
        'A11': { value: 'Shopping' }, 'B11': { value: 200 }, 'C11': { value: 0 }, 'D11': { value: null, formula: '=B11-C11' },
        'A12': { value: 'Miscellaneous' }, 'B12': { value: 150 }, 'C12': { value: 0 }, 'D12': { value: null, formula: '=B12-C12' },
        'A14': { value: 'TOTAL' },
        'B14': { value: null, formula: '=SUM(B6:B12)' }, 'C14': { value: null, formula: '=SUM(C6:C12)' }, 'D14': { value: null, formula: '=SUM(D6:D12)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#2563EB', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A5','B5','C5','D5','E5'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#2563EB' });
      state.setCellFormat('A14', { bold: true });
      ['B14','C14','D14'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DBEAFE' }));
      break;
    }

    case 'create_baby_budget': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Baby Expense Tracker' },
        'A3': { value: 'Category' }, 'B3': { value: 'Budgeted' }, 'C3': { value: 'Spent' }, 'D3': { value: 'Remaining' },
        'A4': { value: 'Nursery/Furniture' }, 'B4': { value: 2000 }, 'C4': { value: 0 }, 'D4': { value: null, formula: '=B4-C4' },
        'A5': { value: 'Car Seat/Stroller' }, 'B5': { value: 800 }, 'C5': { value: 0 }, 'D5': { value: null, formula: '=B5-C5' },
        'A6': { value: 'Clothing' }, 'B6': { value: 500 }, 'C6': { value: 0 }, 'D6': { value: null, formula: '=B6-C6' },
        'A7': { value: 'Diapers & Wipes' }, 'B7': { value: 1200 }, 'C7': { value: 0 }, 'D7': { value: null, formula: '=B7-C7' },
        'A8': { value: 'Formula/Feeding' }, 'B8': { value: 600 }, 'C8': { value: 0 }, 'D8': { value: null, formula: '=B8-C8' },
        'A9': { value: 'Healthcare' }, 'B9': { value: 500 }, 'C9': { value: 0 }, 'D9': { value: null, formula: '=B9-C9' },
        'A10': { value: 'Toys & Books' }, 'B10': { value: 300 }, 'C10': { value: 0 }, 'D10': { value: null, formula: '=B10-C10' },
        'A12': { value: 'TOTAL' },
        'B12': { value: null, formula: '=SUM(B4:B10)' }, 'C12': { value: null, formula: '=SUM(C4:C10)' }, 'D12': { value: null, formula: '=SUM(D4:D10)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#EC4899', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#EC4899' });
      state.setCellFormat('A12', { bold: true });
      ['B12','C12','D12'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FCE7F3' }));
      break;
    }

    case 'create_college_savings': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'College Savings Tracker' },
        'A3': { value: "Child's Name" }, 'B3': { value: '' },
        'A4': { value: 'Current Age' }, 'B4': { value: 2 },
        'A5': { value: 'Target College Age' }, 'B5': { value: 18 },
        'A6': { value: 'Annual Cost (Today $)' }, 'B6': { value: 25000 },
        'A7': { value: 'Inflation Rate' }, 'B7': { value: 0.05 },
        'A8': { value: 'Expected Return' }, 'B8': { value: 0.07 },
        'A9': { value: 'Current Balance' }, 'B9': { value: 5000 },
        'A10': { value: 'Monthly Contribution' }, 'B10': { value: 300 },
        'A12': { value: 'Years to College' }, 'B12': { value: null, formula: '=B5-B4' },
        'A13': { value: 'Future Annual Cost' }, 'B13': { value: null, formula: '=B6*((1+B7)^B12)' },
        'A14': { value: 'Total 4-Year Cost' }, 'B14': { value: null, formula: '=B13*4' },
        'A15': { value: 'Projected Savings' }, 'B15': { value: null, formula: '=B9*((1+B8)^B12)+B10*(((1+B8)^B12-1)/B8)*12' },
        'A16': { value: 'Shortfall / Surplus' }, 'B16': { value: null, formula: '=B15-B14' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#059669' });
      ['A3','A4','A5','A6','A7','A8','A9','A10','A12','A13','A14','A15','A16'].forEach((c) => state.setCellFormat(c, { bold: true }));
      ['B12','B13','B14','B15','B16'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#D1FAE5' }));
      break;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FREELANCER TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════════

    case 'create_freelancer_invoice': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'INVOICE' },
        'A3': { value: 'Invoice #:' }, 'B3': { value: 'INV-001' },
        'A4': { value: 'Date:' }, 'B4': { value: '2024-01-15' },
        'A5': { value: 'Due Date:' }, 'B5': { value: '2024-02-15' },
        'A7': { value: 'Bill To:' }, 'B7': { value: 'Client Name' },
        'A8': { value: '' }, 'B8': { value: 'Client Address' },
        'A10': { value: 'Description' }, 'B10': { value: 'Hours' }, 'C10': { value: 'Rate' }, 'D10': { value: 'Amount' },
        'A11': { value: 'Web Design' }, 'B11': { value: 40 }, 'C11': { value: 100 }, 'D11': { value: null, formula: '=B11*C11' },
        'A12': { value: 'Development' }, 'B12': { value: 60 }, 'C12': { value: 120 }, 'D12': { value: null, formula: '=B12*C12' },
        'A13': { value: 'Consulting' }, 'B13': { value: 10 }, 'C13': { value: 150 }, 'D13': { value: null, formula: '=B13*C13' },
        'A15': { value: 'SUBTOTAL' }, 'D15': { value: null, formula: '=SUM(D11:D13)' },
        'A16': { value: 'Tax (10%)' }, 'D16': { value: null, formula: '=D15*0.1' },
        'A17': { value: 'TOTAL DUE' }, 'D17': { value: null, formula: '=D15+D16' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A10','B10','C10','D10'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 20, fontColor: '#B45309' });
      state.setCellFormat('A17', { bold: true });
      state.setCellFormat('D17', { bold: true, fontSize: 14, bgColor: '#FEF3C7' });
      break;
    }

    case 'create_quarterly_tax': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Quarterly Tax Estimator' },
        'A3': { value: 'Quarter' }, 'B3': { value: 'Gross Income' }, 'C3': { value: 'Expenses' }, 'D3': { value: 'Net Income' }, 'E3': { value: 'Tax Rate' }, 'F3': { value: 'Est. Tax Due' },
        'A4': { value: 'Q1 (Jan-Mar)' }, 'B4': { value: 15000 }, 'C4': { value: 3000 }, 'D4': { value: null, formula: '=B4-C4' }, 'E4': { value: 0.30 }, 'F4': { value: null, formula: '=D4*E4' },
        'A5': { value: 'Q2 (Apr-Jun)' }, 'B5': { value: 18000 }, 'C5': { value: 4000 }, 'D5': { value: null, formula: '=B5-C5' }, 'E5': { value: 0.30 }, 'F5': { value: null, formula: '=D5*E5' },
        'A6': { value: 'Q3 (Jul-Sep)' }, 'B6': { value: 12000 }, 'C6': { value: 2500 }, 'D6': { value: null, formula: '=B6-C6' }, 'E6': { value: 0.30 }, 'F6': { value: null, formula: '=D6*E6' },
        'A7': { value: 'Q4 (Oct-Dec)' }, 'B7': { value: 16000 }, 'C7': { value: 3500 }, 'D7': { value: null, formula: '=B7-C7' }, 'E7': { value: 0.30 }, 'F7': { value: null, formula: '=D7*E7' },
        'A9': { value: 'ANNUAL TOTAL' },
        'B9': { value: null, formula: '=SUM(B4:B7)' }, 'C9': { value: null, formula: '=SUM(C4:C7)' }, 'D9': { value: null, formula: '=SUM(D4:D7)' }, 'F9': { value: null, formula: '=SUM(F4:F7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A9', { bold: true });
      ['B9','C9','D9','F9'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEF3C7' }));
      break;
    }

    case 'create_mileage_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Mileage Tracker' },
        'A3': { value: 'Date' }, 'B3': { value: 'Start Location' }, 'C3': { value: 'End Location' }, 'D3': { value: 'Miles' }, 'E3': { value: 'Purpose' }, 'F3': { value: 'Deduction' },
        'A4': { value: '2024-01-05' }, 'B4': { value: 'Office' }, 'C4': { value: 'Client Site' }, 'D4': { value: 25 }, 'E4': { value: 'Client meeting' }, 'F4': { value: null, formula: '=D4*0.655' },
        'A5': { value: '2024-01-10' }, 'B5': { value: 'Home' }, 'C5': { value: 'Coffee Shop' }, 'D5': { value: 12 }, 'E5': { value: 'Work session' }, 'F5': { value: null, formula: '=D5*0.655' },
        'A6': { value: '2024-01-15' }, 'B6': { value: 'Office' }, 'C6': { value: 'Warehouse' }, 'D6': { value: 30 }, 'E6': { value: 'Supply pickup' }, 'F6': { value: null, formula: '=D6*0.655' },
        'A8': { value: 'TOTALS' },
        'D8': { value: null, formula: '=SUM(D4:D6)' }, 'F8': { value: null, formula: '=SUM(F4:F6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A8', { bold: true });
      ['D8','F8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEF3C7' }));
      break;
    }

    case 'create_client_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Client Tracker' },
        'A3': { value: 'Client' }, 'B3': { value: 'Project' }, 'C3': { value: 'Status' }, 'D3': { value: 'Invoice' }, 'E3': { value: 'Amount' }, 'F3': { value: 'Paid' }, 'G3': { value: 'Balance' },
        'A4': { value: 'Acme Corp' }, 'B4': { value: 'Website Redesign' }, 'C4': { value: 'Active' }, 'D4': { value: 'INV-001' }, 'E4': { value: 5000 }, 'F4': { value: 2500 }, 'G4': { value: null, formula: '=E4-F4' },
        'A5': { value: 'Beta LLC' }, 'B5': { value: 'Mobile App' }, 'C5': { value: 'Active' }, 'D5': { value: 'INV-002' }, 'E5': { value: 12000 }, 'F5': { value: 4000 }, 'G5': { value: null, formula: '=E5-F5' },
        'A6': { value: 'Gamma Inc' }, 'B6': { value: 'Consulting' }, 'C6': { value: 'Completed' }, 'D6': { value: 'INV-003' }, 'E6': { value: 3000 }, 'F6': { value: 3000 }, 'G6': { value: null, formula: '=E6-F6' },
        'A8': { value: 'TOTALS' },
        'E8': { value: null, formula: '=SUM(E4:E6)' }, 'F8': { value: null, formula: '=SUM(F4:F6)' }, 'G8': { value: null, formula: '=SUM(G4:G6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A8', { bold: true });
      ['E8','F8','G8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEF3C7' }));
      break;
    }

    case 'create_hourly_timesheet': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Hourly Timesheet' },
        'A2': { value: 'Week of: __________' },
        'A4': { value: 'Day' }, 'B4': { value: 'Project' }, 'C4': { value: 'Start' }, 'D4': { value: 'End' }, 'E4': { value: 'Hours' }, 'F4': { value: 'Rate' }, 'G4': { value: 'Total' },
        'A5': { value: 'Mon' }, 'B5': { value: 'Project A' }, 'C5': { value: '09:00' }, 'D5': { value: '17:00' }, 'E5': { value: 8 }, 'F5': { value: 100 }, 'G5': { value: null, formula: '=E5*F5' },
        'A6': { value: 'Tue' }, 'B6': { value: 'Project A' }, 'C6': { value: '09:00' }, 'D6': { value: '17:00' }, 'E6': { value: 8 }, 'F6': { value: 100 }, 'G6': { value: null, formula: '=E6*F6' },
        'A7': { value: 'Wed' }, 'B7': { value: 'Project B' }, 'C7': { value: '10:00' }, 'D7': { value: '16:00' }, 'E7': { value: 6 }, 'F7': { value: 100 }, 'G7': { value: null, formula: '=E7*F7' },
        'A8': { value: 'Thu' }, 'B8': { value: 'Project A' }, 'C8': { value: '09:00' }, 'D8': { value: '17:00' }, 'E8': { value: 8 }, 'F8': { value: 100 }, 'G8': { value: null, formula: '=E8*F8' },
        'A9': { value: 'Fri' }, 'B9': { value: 'Project B' }, 'C9': { value: '09:00' }, 'D9': { value: '15:00' }, 'E9': { value: 6 }, 'F9': { value: 100 }, 'G9': { value: null, formula: '=E9*F9' },
        'A11': { value: 'TOTAL' },
        'E11': { value: null, formula: '=SUM(E5:E9)' }, 'G11': { value: null, formula: '=SUM(G5:G9)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A4','B4','C4','D4','E4','F4','G4'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A11', { bold: true });
      ['E11','G11'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEF3C7' }));
      break;
    }

    case 'create_project_quote': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'PROJECT QUOTE' },
        'A3': { value: 'Client:' }, 'B3': { value: '' },
        'A4': { value: 'Project:' }, 'B4': { value: '' },
        'A5': { value: 'Date:' }, 'B5': { value: '2024-01-15' },
        'A7': { value: 'Item' }, 'B7': { value: 'Description' }, 'C7': { value: 'Qty' }, 'D7': { value: 'Unit Price' }, 'E7': { value: 'Total' },
        'A8': { value: 'Design' }, 'B8': { value: 'UI/UX design' }, 'C8': { value: 1 }, 'D8': { value: 2000 }, 'E8': { value: null, formula: '=C8*D8' },
        'A9': { value: 'Development' }, 'B9': { value: 'Frontend build' }, 'C9': { value: 1 }, 'D9': { value: 5000 }, 'E9': { value: null, formula: '=C9*D9' },
        'A10': { value: 'Testing' }, 'B10': { value: 'QA & bug fixes' }, 'C10': { value: 1 }, 'D10': { value: 1000 }, 'E10': { value: null, formula: '=C10*D10' },
        'A12': { value: 'SUBTOTAL' }, 'E12': { value: null, formula: '=SUM(E8:E10)' },
        'A13': { value: 'Tax (10%)' }, 'E13': { value: null, formula: '=E12*0.1' },
        'A14': { value: 'TOTAL' }, 'E14': { value: null, formula: '=E12+E13' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A7','B7','C7','D7','E7'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 20, fontColor: '#B45309' });
      state.setCellFormat('A14', { bold: true });
      state.setCellFormat('E14', { bold: true, fontSize: 14, bgColor: '#FEF3C7' });
      break;
    }

    case 'create_income_expense_log': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Income & Expense Log' },
        'A3': { value: 'Date' }, 'B3': { value: 'Type' }, 'C3': { value: 'Category' }, 'D3': { value: 'Description' }, 'E3': { value: 'Amount' }, 'F3': { value: 'Balance' },
        'A4': { value: '2024-01-01' }, 'B4': { value: 'Income' }, 'C4': { value: 'Client Payment' }, 'D4': { value: 'Acme Corp invoice' }, 'E4': { value: 5000 }, 'F4': { value: 5000 },
        'A5': { value: '2024-01-03' }, 'B5': { value: 'Expense' }, 'C5': { value: 'Software' }, 'D5': { value: 'Adobe subscription' }, 'E5': { value: -55 }, 'F5': { value: null, formula: '=F4+E5' },
        'A6': { value: '2024-01-05' }, 'B6': { value: 'Expense' }, 'C6': { value: 'Office' }, 'D6': { value: 'Desk supplies' }, 'E6': { value: -120 }, 'F6': { value: null, formula: '=F5+E6' },
        'A7': { value: '2024-01-10' }, 'B7': { value: 'Income' }, 'C7': { value: 'Consulting' }, 'D7': { value: 'Beta LLC' }, 'E7': { value: 2000 }, 'F7': { value: null, formula: '=F6+E7' },
        'A8': { value: '2024-01-15' }, 'B8': { value: 'Expense' }, 'C8': { value: 'Travel' }, 'D8': { value: 'Client meeting transport' }, 'E8': { value: -85 }, 'F8': { value: null, formula: '=F7+E8' },
        'A10': { value: 'TOTALS' },
        'C10': { value: null, formula: '=SUMIF(B4:B8,"Income",E4:E8)' }, 'E10': { value: null, formula: '=SUMIF(B4:B8,"Expense",E4:E8)' }, 'F10': { value: null, formula: '=F8' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A10', { bold: true });
      ['C10','E10','F10'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEF3C7' }));
      break;
    }

    case 'create_equipment_depreciation': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Equipment Depreciation Tracker' },
        'A3': { value: 'Item' }, 'B3': { value: 'Purchase Date' }, 'C3': { value: 'Cost' }, 'D3': { value: 'Salvage Value' }, 'E3': { value: 'Useful Life (yr)' }, 'F3': { value: 'Annual Depreciation' }, 'G3': { value: 'Current Value' },
        'A4': { value: 'MacBook Pro' }, 'B4': { value: '2023-06-01' }, 'C4': { value: 2500 }, 'D4': { value: 500 }, 'E4': { value: 4 }, 'F4': { value: null, formula: '=(C4-D4)/E4' }, 'G4': { value: null, formula: '=C4-F4' },
        'A5': { value: 'Camera' }, 'B5': { value: '2023-01-15' }, 'C5': { value: 3000 }, 'D5': { value: 600 }, 'E5': { value: 5 }, 'F5': { value: null, formula: '=(C5-D5)/E5' }, 'G5': { value: null, formula: '=C5-F5' },
        'A6': { value: 'Standing Desk' }, 'B6': { value: '2023-09-01' }, 'C6': { value: 800 }, 'D6': { value: 100 }, 'E6': { value: 7 }, 'F6': { value: null, formula: '=(C6-D6)/E6' }, 'G6': { value: null, formula: '=C6-F6' },
        'A8': { value: 'TOTALS' },
        'C8': { value: null, formula: '=SUM(C4:C6)' }, 'F8': { value: null, formula: '=SUM(F4:F6)' }, 'G8': { value: null, formula: '=SUM(G4:G6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A8', { bold: true });
      ['C8','F8','G8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FEF3C7' }));
      break;
    }

    case 'create_profit_margin': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Profit Margin Calculator' },
        'A3': { value: 'Product' }, 'B3': { value: 'Selling Price' }, 'C3': { value: 'Cost' }, 'D3': { value: 'Profit' }, 'E3': { value: 'Margin %' },
        'A4': { value: 'Product A' }, 'B4': { value: 100 }, 'C4': { value: 60 }, 'D4': { value: null, formula: '=B4-C4' }, 'E4': { value: null, formula: '=D4/B4' },
        'A5': { value: 'Product B' }, 'B5': { value: 250 }, 'C5': { value: 150 }, 'D5': { value: null, formula: '=B5-C5' }, 'E5': { value: null, formula: '=D5/B5' },
        'A6': { value: 'Product C' }, 'B6': { value: 75 }, 'C6': { value: 30 }, 'D6': { value: null, formula: '=B6-C6' }, 'E6': { value: null, formula: '=D6/B6' },
        'A8': { value: 'AVERAGE MARGIN' }, 'E8': { value: null, formula: '=AVERAGE(E4:E6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A8', { bold: true });
      state.setCellFormat('E8', { bold: true, fontSize: 14, bgColor: '#FEF3C7' });
      break;
    }

    case 'create_freelancer_dashboard': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Freelancer Dashboard' },
        'A3': { value: 'This Month' }, 'B3': { value: 'Amount' },
        'A4': { value: 'Income' }, 'B4': { value: 8000 },
        'A5': { value: 'Expenses' }, 'B5': { value: 1500 },
        'A6': { value: 'Net Profit' }, 'B6': { value: null, formula: '=B4-B5' },
        'A8': { value: 'Outstanding Invoices' }, 'B8': { value: 'Amount' }, 'C8': { value: 'Days Overdue' },
        'A9': { value: 'INV-001' }, 'B9': { value: 2500 }, 'C9': { value: 0 },
        'A10': { value: 'INV-002' }, 'B10': { value: 4000 }, 'C10': { value: 15 },
        'A11': { value: 'INV-003' }, 'B11': { value: 1500 }, 'C11': { value: 30 },
        'A13': { value: 'Total Outstanding' }, 'B13': { value: null, formula: '=SUM(B9:B11)' },
        'A15': { value: 'YTD Income' }, 'B15': { value: 48000 },
        'A16': { value: 'YTD Expenses' }, 'B16': { value: 9000 },
        'A17': { value: 'YTD Net' }, 'B17': { value: null, formula: '=B15-B16' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#B45309' });
      state.setCellFormat('A3', { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF' });
      state.setCellFormat('B3', { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF' });
      state.setCellFormat('B6', { bold: true, bgColor: '#D1FAE5' });
      state.setCellFormat('A8', { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF' });
      state.setCellFormat('B8', { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF' });
      state.setCellFormat('C8', { bold: true, bgColor: '#B45309', fontColor: '#FFFFFF' });
      state.setCellFormat('B13', { bold: true, bgColor: '#FEF3C7' });
      state.setCellFormat('B17', { bold: true, bgColor: '#D1FAE5' });
      break;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // REAL ESTATE TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════════

    case 'create_rental_property': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Rental Property Tracker' },
        'A3': { value: 'Property' }, 'B3': { value: 'Address' }, 'C3': { value: 'Monthly Rent' }, 'D3': { value: 'Vacancy %' }, 'E3': { value: 'Expenses' }, 'F3': { value: 'Net Income' },
        'A4': { value: 'Unit 1' }, 'B4': { value: '123 Main St' }, 'C4': { value: 1500 }, 'D4': { value: 0.05 }, 'E4': { value: 400 }, 'F4': { value: null, formula: '=C4*(1-D4)-E4' },
        'A5': { value: 'Unit 2' }, 'B5': { value: '123 Main St' }, 'C5': { value: 1400 }, 'D5': { value: 0 }, 'E5': { value: 380 }, 'F5': { value: null, formula: '=C5*(1-D5)-E5' },
        'A6': { value: 'Unit 3' }, 'B6': { value: '456 Oak Ave' }, 'C6': { value: 1800 }, 'D6': { value: 0.08 }, 'E6': { value: 450 }, 'F6': { value: null, formula: '=C6*(1-D6)-E6' },
        'A8': { value: 'TOTALS' },
        'C8': { value: null, formula: '=SUM(C4:C6)' }, 'E8': { value: null, formula: '=SUM(E4:E6)' }, 'F8': { value: null, formula: '=SUM(F4:F6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      state.setCellFormat('A8', { bold: true });
      ['C8','E8','F8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DBEAFE' }));
      break;
    }

    case 'create_mortgage_calculator': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Mortgage Calculator' },
        'A3': { value: 'Loan Amount' }, 'B3': { value: 300000 },
        'A4': { value: 'Interest Rate (annual)' }, 'B4': { value: 0.065 },
        'A5': { value: 'Loan Term (years)' }, 'B5': { value: 30 },
        'A7': { value: 'Monthly Payment' }, 'B7': { value: null, formula: '=PMT(B4/12,B5*12,-B3)' },
        'A8': { value: 'Total Paid' }, 'B8': { value: null, formula: '=B7*B5*12' },
        'A9': { value: 'Total Interest' }, 'B9': { value: null, formula: '=B8-B3' },
        'A11': { value: 'Year' }, 'B11': { value: 'Payment' }, 'C11': { value: 'Principal' }, 'D11': { value: 'Interest' }, 'E11': { value: 'Balance' },
        'A12': { value: 1 }, 'B12': { value: null, formula: '=$B$7*12' }, 'C12': { value: null, formula: '=IPMT($B$4/12,1,$B$5*12,-$B$3)*12' }, 'D12': { value: null, formula: '=PPMT($B$4/12,1,$B$5*12,-$B$3)*12' }, 'E12': { value: null, formula: '=$B$3-C12' },
        'A13': { value: 2 }, 'B13': { value: null, formula: '=$B$7*12' }, 'C13': { value: null, formula: '=IPMT($B$4/12,2,$B$5*12,-$B$3)*12' }, 'D13': { value: null, formula: '=PPMT($B$4/12,2,$B$5*12,-$B$3)*12' }, 'E13': { value: null, formula: '=E12-C13' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      ['A3','A4','A5','A7','A8','A9'].forEach((c) => state.setCellFormat(c, { bold: true }));
      state.setCellFormat('B7', { bold: true, fontSize: 14, bgColor: '#DBEAFE' });
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A11','B11','C11','D11','E11'].forEach((c) => state.setCellFormat(c, hdr));
      break;
    }

    case 'create_airbnb_income': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Airbnb Income Tracker' },
        'A3': { value: 'Month' }, 'B3': { value: 'Nights Booked' }, 'C3': { value: 'Nightly Rate' }, 'D3': { value: 'Gross Income' }, 'E3': { value: 'Cleaning Fee' }, 'F3': { value: 'Platform Fee' }, 'G3': { value: 'Net Income' },
        'A4': { value: 'Jan' }, 'B4': { value: 22 }, 'C4': { value: 120 }, 'D4': { value: null, formula: '=B4*C4' }, 'E4': { value: 200 }, 'F4': { value: null, formula: '=D4*0.03' }, 'G4': { value: null, formula: '=D4-E4-F4' },
        'A5': { value: 'Feb' }, 'B5': { value: 18 }, 'C5': { value: 120 }, 'D5': { value: null, formula: '=B5*C5' }, 'E5': { value: 150 }, 'F5': { value: null, formula: '=D5*0.03' }, 'G5': { value: null, formula: '=D5-E5-F5' },
        'A6': { value: 'Mar' }, 'B6': { value: 25 }, 'C6': { value: 130 }, 'D6': { value: null, formula: '=B6*C6' }, 'E6': { value: 220 }, 'F6': { value: null, formula: '=D6*0.03' }, 'G6': { value: null, formula: '=D6-E6-F6' },
        'A8': { value: 'TOTALS' },
        'D8': { value: null, formula: '=SUM(D4:D6)' }, 'G8': { value: null, formula: '=SUM(G4:G6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      state.setCellFormat('A8', { bold: true });
      ['D8','G8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DBEAFE' }));
      break;
    }

    case 'create_property_comparison': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Property Comparison' },
        'A3': { value: 'Metric' }, 'B3': { value: 'Property A' }, 'C3': { value: 'Property B' }, 'D3': { value: 'Property C' },
        'A4': { value: 'Price' }, 'B4': { value: 350000 }, 'C4': { value: 420000 }, 'D4': { value: 295000 },
        'A5': { value: 'Bedrooms' }, 'B5': { value: 3 }, 'C5': { value: 4 }, 'D5': { value: 2 },
        'A6': { value: 'Bathrooms' }, 'B6': { value: 2 }, 'C6': { value: 3 }, 'D6': { value: 1 },
        'A7': { value: 'Sq Ft' }, 'B7': { value: 1800 }, 'C7': { value: 2400 }, 'D7': { value: 1200 },
        'A8': { value: '$/Sq Ft' }, 'B8': { value: null, formula: '=B4/B7' }, 'C8': { value: null, formula: '=C4/C7' }, 'D8': { value: null, formula: '=D4/D7' },
        'A9': { value: 'Year Built' }, 'B9': { value: 2005 }, 'C9': { value: 2015 }, 'D9': { value: 1998 },
        'A10': { value: 'HOA' }, 'B10': { value: 200 }, 'C10': { value: 350 }, 'D10': { value: 0 },
        'A11': { value: 'Est. Monthly Payment' }, 'B11': { value: null, formula: '=PMT(0.065/12,360,-B4)+B10' }, 'C11': { value: null, formula: '=PMT(0.065/12,360,-C4)+C10' }, 'D11': { value: null, formula: '=PMT(0.065/12,360,-D4)+D10' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      ['A4','A5','A6','A7','A8','A9','A10','A11'].forEach((c) => state.setCellFormat(c, { bold: true }));
      break;
    }

    case 'create_rent_roll': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Rent Roll' },
        'A3': { value: 'Unit' }, 'B3': { value: 'Tenant' }, 'C3': { value: 'Lease Start' }, 'D3': { value: 'Rent Amount' }, 'E3': { value: 'Paid' }, 'F3': { value: 'Balance' }, 'G3': { value: 'Status' },
        'A4': { value: '101' }, 'B4': { value: 'John Smith' }, 'C4': { value: '2023-06-01' }, 'D4': { value: 1500 }, 'E4': { value: 1500 }, 'F4': { value: null, formula: '=D4-E4' }, 'G4': { value: 'Paid' },
        'A5': { value: '102' }, 'B5': { value: 'Jane Doe' }, 'C5': { value: '2023-08-01' }, 'D5': { value: 1400 }, 'E5': { value: 1400 }, 'F5': { value: null, formula: '=D5-E5' }, 'G5': { value: 'Paid' },
        'A6': { value: '103' }, 'B6': { value: 'Bob Jones' }, 'C6': { value: '2024-01-01' }, 'D6': { value: 1600 }, 'E6': { value: 1000 }, 'F6': { value: null, formula: '=D6-E6' }, 'G6': { value: 'Partial' },
        'A7': { value: '201' }, 'B7': { value: 'Alice Brown' }, 'C7': { value: '2023-03-01' }, 'D7': { value: 1800 }, 'E7': { value: 0 }, 'F7': { value: null, formula: '=D7-E7' }, 'G7': { value: 'Late' },
        'A9': { value: 'TOTALS' },
        'D9': { value: null, formula: '=SUM(D4:D7)' }, 'E9': { value: null, formula: '=SUM(E4:E7)' }, 'F9': { value: null, formula: '=SUM(F4:F7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      state.setCellFormat('A9', { bold: true });
      ['D9','E9','F9'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DBEAFE' }));
      break;
    }

    case 'create_lease_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Lease Tracker' },
        'A3': { value: 'Unit' }, 'B3': { value: 'Tenant' }, 'C3': { value: 'Lease Start' }, 'D3': { value: 'Lease End' }, 'E3': { value: 'Term (months)' }, 'F3': { value: 'Status' },
        'A4': { value: '101' }, 'B4': { value: 'John Smith' }, 'C4': { value: '2023-06-01' }, 'D4': { value: '2024-05-31' }, 'E4': { value: 12 }, 'F4': { value: 'Expiring Soon' },
        'A5': { value: '102' }, 'B5': { value: 'Jane Doe' }, 'C5': { value: '2023-08-01' }, 'D5': { value: '2025-07-31' }, 'E5': { value: 24 }, 'F5': { value: 'Active' },
        'A6': { value: '103' }, 'B6': { value: 'Bob Jones' }, 'C6': { value: '2024-01-01' }, 'D6': { value: '2024-12-31' }, 'E6': { value: 12 }, 'F6': { value: 'Active' },
        'A7': { value: '201' }, 'B7': { value: 'Alice Brown' }, 'C7': { value: '2023-03-01' }, 'D7': { value: '2024-02-28' }, 'E7': { value: 12 }, 'F7': { value: 'Expired' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      break;
    }

    case 'create_renovation_budget': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Renovation Budget' },
        'A3': { value: 'Room' }, 'B3': { value: 'Contractor' }, 'C3': { value: 'Estimated' }, 'D3': { value: 'Actual' }, 'E3': { value: 'Difference' }, 'F3': { value: 'Status' },
        'A4': { value: 'Kitchen' }, 'C4': { value: 15000 }, 'D4': { value: 0 }, 'E4': { value: null, formula: '=C4-D4' }, 'F4': { value: 'Planning' },
        'A5': { value: 'Master Bath' }, 'C5': { value: 8000 }, 'D5': { value: 0 }, 'E5': { value: null, formula: '=C5-D5' }, 'F5': { value: 'Planning' },
        'A6': { value: 'Living Room' }, 'C6': { value: 5000 }, 'D6': { value: 0 }, 'E6': { value: null, formula: '=C6-D6' }, 'F6': { value: 'Planning' },
        'A7': { value: 'Bedroom' }, 'C7': { value: 3000 }, 'D7': { value: 0 }, 'E7': { value: null, formula: '=C7-D7' }, 'F7': { value: 'Planning' },
        'A9': { value: 'TOTAL' },
        'C9': { value: null, formula: '=SUM(C4:C7)' }, 'D9': { value: null, formula: '=SUM(D4:D7)' }, 'E9': { value: null, formula: '=SUM(E4:E7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#1D4ED8', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      state.setCellFormat('A9', { bold: true });
      ['C9','D9','E9'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DBEAFE' }));
      break;
    }

    case 'create_roi_calculator': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'ROI Calculator' },
        'A3': { value: 'Purchase Price' }, 'B3': { value: 300000 },
        'A4': { value: 'Closing Costs' }, 'B4': { value: 9000 },
        'A5': { value: 'Renovation Costs' }, 'B5': { value: 15000 },
        'A6': { value: 'Total Investment' }, 'B6': { value: null, formula: '=B3+B4+B5' },
        'A8': { value: 'Annual Rental Income' }, 'B8': { value: 21600 },
        'A9': { value: 'Annual Expenses' }, 'B9': { value: 6000 },
        'A10': { value: 'Annual Net Income' }, 'B10': { value: null, formula: '=B8-B9' },
        'A12': { value: 'Cap Rate' }, 'B12': { value: null, formula: '=B10/B6' },
        'A13': { value: 'Cash-on-Cash Return' }, 'B13': { value: null, formula: '=B10/B5' },
        'A14': { value: 'Gross Yield' }, 'B14': { value: null, formula: '=B8/B6' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#1D4ED8' });
      ['A3','A4','A5','A6','A8','A9','A10','A12','A13','A14'].forEach((c) => state.setCellFormat(c, { bold: true }));
      ['B6','B10','B12','B13','B14'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#DBEAFE' }));
      break;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SMALL BUSINESS TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════════

    case 'create_sales_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Sales Tracker' },
        'A3': { value: 'Date' }, 'B3': { value: 'Product' }, 'C3': { value: 'Qty Sold' }, 'D3': { value: 'Unit Price' }, 'E3': { value: 'Revenue' }, 'F3': { value: 'Cost' }, 'G3': { value: 'Profit' },
        'A4': { value: '2024-01-05' }, 'B4': { value: 'Widget A' }, 'C4': { value: 25 }, 'D4': { value: 20 }, 'E4': { value: null, formula: '=C4*D4' }, 'F4': { value: 12 }, 'G4': { value: null, formula: '=E4-(C4*F4)' },
        'A5': { value: '2024-01-05' }, 'B5': { value: 'Widget B' }, 'C5': { value: 10 }, 'D5': { value: 50 }, 'E5': { value: null, formula: '=C5*D5' }, 'F5': { value: 30 }, 'G5': { value: null, formula: '=E5-(C5*F5)' },
        'A6': { value: '2024-01-06' }, 'B6': { value: 'Widget A' }, 'C6': { value: 30 }, 'D6': { value: 20 }, 'E6': { value: null, formula: '=C6*D6' }, 'F6': { value: 12 }, 'G6': { value: null, formula: '=E6-(C6*F6)' },
        'A7': { value: '2024-01-07' }, 'B7': { value: 'Service X' }, 'C7': { value: 5 }, 'D7': { value: 200 }, 'E7': { value: null, formula: '=C7*D7' }, 'F7': { value: 80 }, 'G7': { value: null, formula: '=E7-(C7*F7)' },
        'A9': { value: 'TOTALS' },
        'E9': { value: null, formula: '=SUM(E4:E7)' }, 'G9': { value: null, formula: '=SUM(G4:G7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A9', { bold: true });
      ['E9','G9'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    case 'create_pnl_statement': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Profit & Loss Statement' },
        'A2': { value: 'Period: __________' },
        'A4': { value: 'REVENUE' }, 'B4': { value: 'Amount' },
        'A5': { value: 'Product Sales' }, 'B5': { value: 50000 },
        'A6': { value: 'Service Revenue' }, 'B6': { value: 30000 },
        'A7': { value: 'Other Income' }, 'B7': { value: 2000 },
        'A8': { value: 'Total Revenue' }, 'B8': { value: null, formula: '=SUM(B5:B7)' },
        'A10': { value: 'COST OF GOODS SOLD' },
        'A11': { value: 'Materials' }, 'B11': { value: 15000 },
        'A12': { value: 'Direct Labor' }, 'B12': { value: 12000 },
        'A13': { value: 'Total COGS' }, 'B13': { value: null, formula: '=SUM(B11:B12)' },
        'A15': { value: 'GROSS PROFIT' }, 'B15': { value: null, formula: '=B8-B13' },
        'A17': { value: 'OPERATING EXPENSES' },
        'A18': { value: 'Rent' }, 'B18': { value: 3000 },
        'A19': { value: 'Utilities' }, 'B19': { value: 500 },
        'A20': { value: 'Marketing' }, 'B20': { value: 2000 },
        'A21': { value: 'Insurance' }, 'B21': { value: 800 },
        'A22': { value: 'Total Expenses' }, 'B22': { value: null, formula: '=SUM(B18:B21)' },
        'A24': { value: 'NET INCOME' }, 'B24': { value: null, formula: '=B15-B22' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      ['A4','A10','A17'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      state.setCellFormat('B4', { bold: true, bgColor: '#EDE9FE' });
      state.setCellFormat('A8', { bold: true });
      state.setCellFormat('B8', { bold: true, bgColor: '#EDE9FE' });
      state.setCellFormat('A13', { bold: true });
      state.setCellFormat('A15', { bold: true, bgColor: '#D1FAE5' });
      state.setCellFormat('B15', { bold: true, bgColor: '#D1FAE5' });
      state.setCellFormat('A24', { bold: true, fontSize: 14, bgColor: '#7C3AED', fontColor: '#FFFFFF' });
      state.setCellFormat('B24', { bold: true, fontSize: 14, bgColor: '#EDE9FE' });
      break;
    }

    case 'create_cash_flow': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Cash Flow Forecast' },
        'A3': { value: 'Month' }, 'B3': { value: 'Starting Balance' }, 'C3': { value: 'Inflows' }, 'D3': { value: 'Outflows' }, 'E3': { value: 'Net Cash Flow' }, 'F3': { value: 'Ending Balance' },
        'A4': { value: 'Jan' }, 'B4': { value: 10000 }, 'C4': { value: 25000 }, 'D4': { value: 22000 }, 'E4': { value: null, formula: '=C4-D4' }, 'F4': { value: null, formula: '=B4+E4' },
        'A5': { value: 'Feb' }, 'B5': { value: null, formula: '=F4' }, 'C5': { value: 22000 }, 'D5': { value: 20000 }, 'E5': { value: null, formula: '=C5-D5' }, 'F5': { value: null, formula: '=B5+E5' },
        'A6': { value: 'Mar' }, 'B6': { value: null, formula: '=F5' }, 'C6': { value: 28000 }, 'D6': { value: 24000 }, 'E6': { value: null, formula: '=C6-D6' }, 'F6': { value: null, formula: '=B6+E6' },
        'A7': { value: 'Apr' }, 'B7': { value: null, formula: '=F6' }, 'C7': { value: 20000 }, 'D7': { value: 23000 }, 'E7': { value: null, formula: '=C7-D7' }, 'F7': { value: null, formula: '=B7+E7' },
        'A8': { value: 'May' }, 'B8': { value: null, formula: '=F7' }, 'C8': { value: 30000 }, 'D8': { value: 21000 }, 'E8': { value: null, formula: '=C8-D8' }, 'F8': { value: null, formula: '=B8+E8' },
        'A9': { value: 'Jun' }, 'B9': { value: null, formula: '=F8' }, 'C9': { value: 26000 }, 'D9': { value: 22000 }, 'E9': { value: null, formula: '=C9-D9' }, 'F9': { value: null, formula: '=B9+E9' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      break;
    }

    case 'create_inventory_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Inventory Tracker' },
        'A3': { value: 'SKU' }, 'B3': { value: 'Product' }, 'C3': { value: 'In Stock' }, 'D3': { value: 'Reorder Point' }, 'E3': { value: 'Unit Cost' }, 'F3': { value: 'Value' }, 'G3': { value: 'Status' },
        'A4': { value: 'WGT-001' }, 'B4': { value: 'Widget A' }, 'C4': { value: 150 }, 'D4': { value: 50 }, 'E4': { value: 12 }, 'F4': { value: null, formula: '=C4*E4' }, 'G4': { value: 'OK' },
        'A5': { value: 'WGT-002' }, 'B5': { value: 'Widget B' }, 'C5': { value: 30 }, 'D5': { value: 50 }, 'E5': { value: 30 }, 'F5': { value: null, formula: '=C5*E5' }, 'G5': { value: 'Reorder' },
        'A6': { value: 'SVC-001' }, 'B6': { value: 'Gadget Pro' }, 'C6': { value: 80 }, 'D6': { value: 25 }, 'E6': { value: 45 }, 'F6': { value: null, formula: '=C6*E6' }, 'G6': { value: 'OK' },
        'A7': { value: 'ACC-001' }, 'B7': { value: 'Accessory Kit' }, 'C7': { value: 10 }, 'D7': { value: 30 }, 'E7': { value: 8 }, 'F7': { value: null, formula: '=C7*E7' }, 'G7': { value: 'Critical' },
        'A9': { value: 'TOTAL INVENTORY VALUE' },
        'F9': { value: null, formula: '=SUM(F4:F7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A9', { bold: true });
      state.setCellFormat('F9', { bold: true, bgColor: '#EDE9FE' });
      break;
    }

    case 'create_payroll_sheet': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Payroll Sheet' },
        'A2': { value: 'Pay Period: __________' },
        'A4': { value: 'Employee' }, 'B4': { value: 'Hours' }, 'C4': { value: 'Rate' }, 'D4': { value: 'Gross Pay' }, 'E4': { value: 'Fed Tax' }, 'F4': { value: 'State Tax' }, 'G4': { value: 'Deductions' }, 'H4': { value: 'Net Pay' },
        'A5': { value: 'Alice Smith' }, 'B5': { value: 40 }, 'C5': { value: 25 }, 'D5': { value: null, formula: '=B5*C5' }, 'E5': { value: null, formula: '=D5*0.12' }, 'F5': { value: null, formula: '=D5*0.05' }, 'G5': { value: 200 }, 'H5': { value: null, formula: '=D5-E5-F5-G5' },
        'A6': { value: 'Bob Johnson' }, 'B6': { value: 35 }, 'C6': { value: 30 }, 'D6': { value: null, formula: '=B6*C6' }, 'E6': { value: null, formula: '=D6*0.12' }, 'F6': { value: null, formula: '=D6*0.05' }, 'G6': { value: 150 }, 'H6': { value: null, formula: '=D6-E6-F6-G6' },
        'A7': { value: 'Carol Davis' }, 'B7': { value: 40 }, 'C7': { value: 28 }, 'D7': { value: null, formula: '=B7*C7' }, 'E7': { value: null, formula: '=D7*0.12' }, 'F7': { value: null, formula: '=D7*0.05' }, 'G7': { value: 180 }, 'H7': { value: null, formula: '=D7-E7-F7-G7' },
        'A9': { value: 'TOTALS' },
        'D9': { value: null, formula: '=SUM(D5:D7)' }, 'H9': { value: null, formula: '=SUM(H5:H7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A4','B4','C4','D4','E4','F4','G4','H4'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A9', { bold: true });
      ['D9','H9'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    case 'create_accounts_receivable': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Accounts Receivable' },
        'A3': { value: 'Invoice' }, 'B3': { value: 'Customer' }, 'C3': { value: 'Date' }, 'D3': { value: 'Due Date' }, 'E3': { value: 'Amount' }, 'F3': { value: 'Paid' }, 'G3': { value: 'Balance' }, 'H3': { value: 'Status' },
        'A4': { value: 'INV-101' }, 'B4': { value: 'Acme Corp' }, 'C4': { value: '2024-01-01' }, 'D4': { value: '2024-01-31' }, 'E4': { value: 5000 }, 'F4': { value: 5000 }, 'G4': { value: null, formula: '=E4-F4' }, 'H4': { value: 'Paid' },
        'A5': { value: 'INV-102' }, 'B5': { value: 'Beta LLC' }, 'C5': { value: '2024-01-10' }, 'D5': { value: '2024-02-10' }, 'E5': { value: 3500 }, 'F5': { value: 0 }, 'G5': { value: null, formula: '=E5-F5' }, 'H5': { value: 'Pending' },
        'A6': { value: 'INV-103' }, 'B6': { value: 'Gamma Inc' }, 'C6': { value: '2024-01-15' }, 'D6': { value: '2024-02-15' }, 'E6': { value: 7200 }, 'F6': { value: 2000 }, 'G6': { value: null, formula: '=E6-F6' }, 'H6': { value: 'Partial' },
        'A8': { value: 'TOTALS' },
        'E8': { value: null, formula: '=SUM(E4:E6)' }, 'F8': { value: null, formula: '=SUM(F4:F6)' }, 'G8': { value: null, formula: '=SUM(G4:G6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3','H3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A8', { bold: true });
      ['E8','F8','G8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    case 'create_accounts_payable': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Accounts Payable' },
        'A3': { value: 'Bill' }, 'B3': { value: 'Vendor' }, 'C3': { value: 'Date' }, 'D3': { value: 'Due Date' }, 'E3': { value: 'Amount' }, 'F3': { value: 'Paid' }, 'G3': { value: 'Balance' }, 'H3': { value: 'Status' },
        'A4': { value: 'BILL-001' }, 'B4': { value: 'Office Supply Co' }, 'C4': { value: '2024-01-05' }, 'D4': { value: '2024-02-05' }, 'E4': { value: 450 }, 'F4': { value: 450 }, 'G4': { value: null, formula: '=E4-F4' }, 'H4': { value: 'Paid' },
        'A5': { value: 'BILL-002' }, 'B5': { value: 'Cloud Services' }, 'C5': { value: '2024-01-10' }, 'D5': { value: '2024-02-10' }, 'E5': { value: 200 }, 'F5': { value: 0 }, 'G5': { value: null, formula: '=E5-F5' }, 'H5': { value: 'Due' },
        'A6': { value: 'BILL-003' }, 'B6': { value: 'Insurance Corp' }, 'C6': { value: '2024-01-15' }, 'D6': { value: '2024-02-15' }, 'E6': { value: 800 }, 'F6': { value: 0 }, 'G6': { value: null, formula: '=E6-F6' }, 'H6': { value: 'Due' },
        'A8': { value: 'TOTALS' },
        'E8': { value: null, formula: '=SUM(E4:E6)' }, 'G8': { value: null, formula: '=SUM(G4:G6)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3','H3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A8', { bold: true });
      ['E8','G8'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    case 'create_break_even': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Break-Even Analysis' },
        'A3': { value: 'Fixed Costs (monthly)' }, 'B3': { value: 5000 },
        'A4': { value: 'Variable Cost per Unit' }, 'B4': { value: 15 },
        'A5': { value: 'Selling Price per Unit' }, 'B5': { value: 40 },
        'A7': { value: 'Break-Even Units' }, 'B7': { value: null, formula: '=B3/(B5-B4)' },
        'A8': { value: 'Break-Even Revenue' }, 'B8': { value: null, formula: '=B7*B5' },
        'A10': { value: 'Units' }, 'B10': { value: 'Revenue' }, 'C10': { value: 'Total Cost' }, 'D10': { value: 'Profit/Loss' },
        'A11': { value: 100 }, 'B11': { value: null, formula: '=A11*$B$5' }, 'C11': { value: null, formula: '=$B$3+(A11*$B$4)' }, 'D11': { value: null, formula: '=B11-C11' },
        'A12': { value: 200 }, 'B12': { value: null, formula: '=A12*$B$5' }, 'C12': { value: null, formula: '=$B$3+(A12*$B$4)' }, 'D12': { value: null, formula: '=B12-C12' },
        'A13': { value: 300 }, 'B13': { value: null, formula: '=A13*$B$5' }, 'C13': { value: null, formula: '=$B$3+(A13*$B$4)' }, 'D13': { value: null, formula: '=B13-C13' },
        'A14': { value: 400 }, 'B14': { value: null, formula: '=A14*$B$5' }, 'C14': { value: null, formula: '=$B$3+(A14*$B$4)' }, 'D14': { value: null, formula: '=B14-C14' },
        'A15': { value: 500 }, 'B15': { value: null, formula: '=A15*$B$5' }, 'C15': { value: null, formula: '=$B$3+(A15*$B$4)' }, 'D15': { value: null, formula: '=B15-C15' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      ['A3','A4','A5','A7','A8'].forEach((c) => state.setCellFormat(c, { bold: true }));
      state.setCellFormat('B7', { bold: true, fontSize: 14, bgColor: '#EDE9FE' });
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A10','B10','C10','D10'].forEach((c) => state.setCellFormat(c, hdr));
      break;
    }

    case 'create_unit_economics': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Unit Economics' },
        'A3': { value: 'Metric' }, 'B3': { value: 'Value' },
        'A4': { value: 'Customer Acquisition Cost (CAC)' }, 'B4': { value: 120 },
        'A5': { value: 'Monthly Revenue per Customer' }, 'B5': { value: 50 },
        'A6': { value: 'Monthly Churn Rate' }, 'B6': { value: 0.05 },
        'A7': { value: 'Avg Customer Lifespan (months)' }, 'B7': { value: null, formula: '=1/B6' },
        'A8': { value: 'Lifetime Value (LTV)' }, 'B8': { value: null, formula: '=B5*B7' },
        'A9': { value: 'LTV / CAC Ratio' }, 'B9': { value: null, formula: '=B8/B4' },
        'A10': { value: 'Payback Period (months)' }, 'B10': { value: null, formula: '=B4/B5' },
        'A12': { value: 'Gross Margin %' }, 'B12': { value: 0.65 },
        'A13': { value: 'Contribution Margin' }, 'B13': { value: null, formula: '=B12-(B6*B7)' },
      };
      state.bulkSetCells(cells);
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      ['A3','A4','A5','A6','A7','A8','A9','A10','A12','A13'].forEach((c) => state.setCellFormat(c, { bold: true }));
      ['B7','B8','B9','B10','B13'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      state.setCellFormat('B3', { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF' });
      break;
    }

    case 'create_startup_costs': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Startup Costs' },
        'A3': { value: 'Category' }, 'B3': { value: 'Item' }, 'C3': { value: 'Cost' }, 'D3': { value: 'Funded' }, 'E3': { value: 'Remaining' },
        'A4': { value: 'Legal' }, 'B4': { value: 'Incorporation' }, 'C4': { value: 500 }, 'D4': { value: 500 }, 'E4': { value: null, formula: '=C4-D4' },
        'A5': { value: 'Legal' }, 'B5': { value: 'Trademarks' }, 'C5': { value: 1000 }, 'D5': { value: 0 }, 'E5': { value: null, formula: '=C5-D5' },
        'A6': { value: 'Technology' }, 'B6': { value: 'Laptop' }, 'C6': { value: 2000 }, 'D6': { value: 2000 }, 'E6': { value: null, formula: '=C6-D6' },
        'A7': { value: 'Technology' }, 'B7': { value: 'Software licenses' }, 'C7': { value: 500 }, 'D7': { value: 500 }, 'E7': { value: null, formula: '=C7-D7' },
        'A8': { value: 'Marketing' }, 'B8': { value: 'Website' }, 'C8': { value: 3000 }, 'D8': { value: 1500 }, 'E8': { value: null, formula: '=C8-D8' },
        'A9': { value: 'Marketing' }, 'B9': { value: 'Business cards' }, 'C9': { value: 200 }, 'D9': { value: 0 }, 'E9': { value: null, formula: '=C9-D9' },
        'A10': { value: 'Office' }, 'B10': { value: 'Supplies' }, 'C10': { value: 800 }, 'D10': { value: 800 }, 'E10': { value: null, formula: '=C10-D10' },
        'A12': { value: 'TOTAL' },
        'C12': { value: null, formula: '=SUM(C4:C10)' }, 'D12': { value: null, formula: '=SUM(D4:D10)' }, 'E12': { value: null, formula: '=SUM(E4:E10)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#7C3AED', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#7C3AED' });
      state.setCellFormat('A12', { bold: true });
      ['C12','D12','E12'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#EDE9FE' }));
      break;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // EDUCATION TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════════

    case 'create_gpa_calculator': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'GPA Calculator' },
        'A3': { value: 'Course' }, 'B3': { value: 'Credits' }, 'C3': { value: 'Grade Points' }, 'D3': { value: 'Quality Points' },
        'A4': { value: 'English 101' }, 'B4': { value: 3 }, 'C4': { value: 4.0 }, 'D4': { value: null, formula: '=B4*C4' },
        'A5': { value: 'Math 201' }, 'B5': { value: 4 }, 'C5': { value: 3.0 }, 'D5': { value: null, formula: '=B5*C5' },
        'A6': { value: 'History 110' }, 'B6': { value: 3 }, 'C6': { value: 3.5 }, 'D6': { value: null, formula: '=B6*C6' },
        'A7': { value: 'Biology 101' }, 'B7': { value: 4 }, 'C7': { value: 2.7 }, 'D7': { value: null, formula: '=B7*C7' },
        'A9': { value: 'TOTALS' },
        'B9': { value: null, formula: '=SUM(B4:B7)' }, 'D9': { value: null, formula: '=SUM(D4:D7)' },
        'A10': { value: 'SEMESTER GPA' },
        'C10': { value: null, formula: '=D9/B9' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#4338CA', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#4338CA' });
      state.setCellFormat('A9', { bold: true });
      state.setCellFormat('A10', { bold: true, fontSize: 14 });
      state.setCellFormat('C10', { bold: true, fontSize: 14, bgColor: '#E0E7FF' });
      break;
    }

    case 'create_class_schedule': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Class Schedule' },
        'A2': { value: 'Semester: __________' },
        'A3': { value: 'Time' }, 'B3': { value: 'Monday' }, 'C3': { value: 'Tuesday' }, 'D3': { value: 'Wednesday' }, 'E3': { value: 'Thursday' }, 'F3': { value: 'Friday' },
        'A4': { value: '8:00 AM' }, 'B4': { value: 'English 101' }, 'D4': { value: 'English 101' }, 'F4': { value: 'English 101' },
        'A5': { value: '10:00 AM' }, 'C5': { value: 'Math 201' }, 'E5': { value: 'Math 201' },
        'A6': { value: '1:00 PM' }, 'B6': { value: 'History 110' }, 'D6': { value: 'History 110' },
        'A7': { value: '3:00 PM' }, 'C7': { value: 'Biology 101' }, 'E7': { value: 'Biology 101' },
        'A9': { value: 'Total Credits' }, 'B9': { value: 14 },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#4338CA', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#4338CA' });
      break;
    }

    case 'create_student_gradebook': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Student Gradebook' },
        'A3': { value: 'Student' }, 'B3': { value: 'Homework' }, 'C3': { value: 'Midterm' }, 'D3': { value: 'Final' }, 'E3': { value: 'Weighted Avg' }, 'F3': { value: 'Letter Grade' },
        'A4': { value: 'Alice' }, 'B4': { value: 92 }, 'C4': { value: 85 }, 'D4': { value: 88 }, 'E4': { value: null, formula: '=B4*0.3+C4*0.3+D4*0.4' },
        'A5': { value: 'Bob' }, 'B5': { value: 78 }, 'C5': { value: 82 }, 'D5': { value: 75 }, 'E5': { value: null, formula: '=B5*0.3+C5*0.3+D5*0.4' },
        'A6': { value: 'Carol' }, 'B6': { value: 95 }, 'C6': { value: 91 }, 'D6': { value: 94 }, 'E6': { value: null, formula: '=B6*0.3+C6*0.3+D6*0.4' },
        'A7': { value: 'David' }, 'B7': { value: 65 }, 'C7': { value: 70 }, 'D7': { value: 68 }, 'E7': { value: null, formula: '=B7*0.3+C7*0.3+D7*0.4' },
        'A9': { value: 'Class Average' },
        'E9': { value: null, formula: '=AVERAGE(E4:E7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#4338CA', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#4338CA' });
      state.setCellFormat('A9', { bold: true });
      state.setCellFormat('E9', { bold: true, bgColor: '#E0E7FF' });
      break;
    }

    case 'create_assignment_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Assignment Tracker' },
        'A3': { value: 'Assignment' }, 'B3': { value: 'Course' }, 'C3': { value: 'Due Date' }, 'D3': { value: 'Status' }, 'E3': { value: 'Grade' }, 'F3': { value: 'Weight' },
        'A4': { value: 'Essay 1' }, 'B4': { value: 'English 101' }, 'C4': { value: '2024-02-01' }, 'D4': { value: 'Done' }, 'E4': { value: 92 }, 'F4': { value: 0.15 },
        'A5': { value: 'Problem Set 3' }, 'B5': { value: 'Math 201' }, 'C5': { value: '2024-02-05' }, 'D5': { value: 'In Progress' }, 'F5': { value: 0.1 },
        'A6': { value: 'Research Paper' }, 'B6': { value: 'History 110' }, 'C6': { value: '2024-02-15' }, 'D6': { value: 'Not Started' }, 'F6': { value: 0.25 },
        'A7': { value: 'Lab Report 2' }, 'B7': { value: 'Biology 101' }, 'C7': { value: '2024-02-08' }, 'D7': { value: 'Done' }, 'E7': { value: 88 }, 'F7': { value: 0.15 },
        'A8': { value: 'Midterm' }, 'B8': { value: 'English 101' }, 'C8': { value: '2024-03-01' }, 'D8': { value: 'Not Started' }, 'F8': { value: 0.25 },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#4338CA', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#4338CA' });
      break;
    }

    case 'create_scholarship_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Scholarship Tracker' },
        'A3': { value: 'Scholarship' }, 'B3': { value: 'Amount' }, 'C3': { value: 'Deadline' }, 'D3': { value: 'Requirements' }, 'E3': { value: 'Status' }, 'F3': { value: 'Applied' },
        'A4': { value: 'Academic Excellence' }, 'B4': { value: 5000 }, 'C4': { value: '2024-03-01' }, 'D4': { value: 'GPA 3.5+' }, 'E4': { value: 'Eligible' }, 'F4': { value: 'No' },
        'A5': { value: 'Community Service' }, 'B5': { value: 2500 }, 'C5': { value: '2024-02-15' }, 'D5': { value: '50+ hrs service' }, 'E5': { value: 'Eligible' }, 'F5': { value: 'Yes' },
        'A6': { value: 'STEM Grant' }, 'B6': { value: 10000 }, 'C6': { value: '2024-04-01' }, 'D6': { value: 'STEM major' }, 'E6': { value: 'Eligible' }, 'F6': { value: 'No' },
        'A7': { value: 'Need-Based Aid' }, 'B7': { value: 3000 }, 'C7': { value: '2024-03-15' }, 'D7': { value: 'Financial need' }, 'E7': { value: 'Pending Review' }, 'F7': { value: 'Yes' },
        'A9': { value: 'TOTAL POTENTIAL' }, 'B9': { value: null, formula: '=SUM(B4:B7)' },
        'A10': { value: 'TOTAL APPLIED' }, 'B10': { value: null, formula: '=SUMIF(F4:F7,"Yes",B4:B7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#4338CA', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#4338CA' });
      state.setCellFormat('A9', { bold: true });
      state.setCellFormat('B9', { bold: true, bgColor: '#E0E7FF' });
      state.setCellFormat('A10', { bold: true });
      state.setCellFormat('B10', { bold: true, bgColor: '#E0E7FF' });
      break;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // HEALTH & WELLNESS TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════════════

    case 'create_workout_log': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Workout Log' },
        'A3': { value: 'Date' }, 'B3': { value: 'Exercise' }, 'C3': { value: 'Sets' }, 'D3': { value: 'Reps' }, 'E3': { value: 'Weight (lbs)' }, 'F3': { value: 'Notes' },
        'A4': { value: '2024-01-15' }, 'B4': { value: 'Bench Press' }, 'C4': { value: 4 }, 'D4': { value: 8 }, 'E4': { value: 135 }, 'F4': { value: '' },
        'A5': { value: '2024-01-15' }, 'B5': { value: 'Squats' }, 'C5': { value: 4 }, 'D5': { value: 10 }, 'E5': { value: 185 }, 'F5': { value: '' },
        'A6': { value: '2024-01-15' }, 'B6': { value: 'Deadlift' }, 'C6': { value: 3 }, 'D6': { value: 6 }, 'E6': { value: 225 }, 'F6': { value: 'PR!' },
        'A7': { value: '2024-01-17' }, 'B7': { value: 'Overhead Press' }, 'C7': { value: 4 }, 'D7': { value: 8 }, 'E7': { value: 95 }, 'F7': { value: '' },
        'A8': { value: '2024-01-17' }, 'B8': { value: 'Rows' }, 'C8': { value: 4 }, 'D8': { value: 10 }, 'E8': { value: 115 }, 'F8': { value: '' },
        'A10': { value: 'Total Sets' }, 'C10': { value: null, formula: '=SUM(C4:C8)' },
        'A11': { value: 'Avg Weight' }, 'E11': { value: null, formula: '=AVERAGE(E4:E8)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#E11D48', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#E11D48' });
      state.setCellFormat('A10', { bold: true });
      state.setCellFormat('C10', { bold: true, bgColor: '#FFE4E6' });
      state.setCellFormat('A11', { bold: true });
      state.setCellFormat('E11', { bold: true, bgColor: '#FFE4E6' });
      break;
    }

    case 'create_meal_planner': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Weekly Meal Planner' },
        'A3': { value: 'Day' }, 'B3': { value: 'Breakfast' }, 'C3': { value: 'Lunch' }, 'D3': { value: 'Dinner' }, 'E3': { value: 'Calories' },
        'A4': { value: 'Monday' }, 'B4': { value: 'Oatmeal & fruit' }, 'C4': { value: 'Chicken salad' }, 'D4': { value: 'Salmon & rice' }, 'E4': { value: 1800 },
        'A5': { value: 'Tuesday' }, 'B5': { value: 'Eggs & toast' }, 'C5': { value: 'Turkey wrap' }, 'D5': { value: 'Pasta' }, 'E5': { value: 2000 },
        'A6': { value: 'Wednesday' }, 'B6': { value: 'Smoothie' }, 'C6': { value: 'Quinoa bowl' }, 'D6': { value: 'Stir fry' }, 'E6': { value: 1750 },
        'A7': { value: 'Thursday' }, 'B7': { value: 'Yogurt parfait' }, 'C7': { value: 'Soup & bread' }, 'D7': { value: 'Grilled chicken' }, 'E7': { value: 1850 },
        'A8': { value: 'Friday' }, 'B8': { value: 'Cereal' }, 'C8': { value: 'Leftovers' }, 'D8': { value: 'Pizza (homemade)' }, 'E8': { value: 2100 },
        'A9': { value: 'Saturday' }, 'B9': { value: 'Pancakes' }, 'C9': { value: 'Sandwich' }, 'D9': { value: 'BBQ chicken' }, 'E9': { value: 2200 },
        'A10': { value: 'Sunday' }, 'B10': { value: 'French toast' }, 'C10': { value: 'Salad' }, 'D10': { value: 'Roast beef' }, 'E10': { value: 1950 },
        'A12': { value: 'Weekly Calories' }, 'E12': { value: null, formula: '=SUM(E4:E10)' },
        'A13': { value: 'Daily Average' }, 'E13': { value: null, formula: '=AVERAGE(E4:E10)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#E11D48', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#E11D48' });
      state.setCellFormat('A12', { bold: true });
      state.setCellFormat('E12', { bold: true, bgColor: '#FFE4E6' });
      state.setCellFormat('A13', { bold: true });
      state.setCellFormat('E13', { bold: true, bgColor: '#FFE4E6' });
      break;
    }

    case 'create_weight_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Weight Tracker' },
        'A3': { value: 'Date' }, 'B3': { value: 'Weight (lbs)' }, 'C3': { value: 'Change' }, 'D3': { value: 'Goal Progress' },
        'A4': { value: '2024-01-01' }, 'B4': { value: 180 }, 'C4': { value: '' }, 'D4': { value: '' },
        'A5': { value: '2024-01-08' }, 'B5': { value: 178 }, 'C5': { value: null, formula: '=B5-B4' }, 'D5': { value: null, formula: '=($B$4-B5)/($B$4-165)' },
        'A6': { value: '2024-01-15' }, 'B6': { value: 177 }, 'C6': { value: null, formula: '=B6-B5' }, 'D6': { value: null, formula: '=($B$4-B6)/($B$4-165)' },
        'A7': { value: '2024-01-22' }, 'B7': { value: 175 }, 'C7': { value: null, formula: '=B7-B6' }, 'D7': { value: null, formula: '=($B$4-B7)/($B$4-165)' },
        'A8': { value: '2024-01-29' }, 'B8': { value: 174 }, 'C8': { value: null, formula: '=B8-B7' }, 'D8': { value: null, formula: '=($B$4-B8)/($B$4-165)' },
        'A10': { value: 'Starting Weight' }, 'B10': { value: null, formula: '=B4' },
        'A11': { value: 'Current Weight' }, 'B11': { value: null, formula: '=B8' },
        'A12': { value: 'Total Lost' }, 'B12': { value: null, formula: '=B4-B8' },
        'A13': { value: 'Goal Weight' }, 'B13': { value: 165 },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#E11D48', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#E11D48' });
      ['A10','A11','A12','A13'].forEach((c) => state.setCellFormat(c, { bold: true }));
      state.setCellFormat('B12', { bold: true, bgColor: '#D1FAE5', fontColor: '#059669' });
      state.setCellFormat('B13', { bold: true, bgColor: '#FFE4E6' });
      break;
    }

    case 'create_habit_tracker': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Habit Tracker' },
        'A3': { value: 'Habit' }, 'B3': { value: 'Mon' }, 'C3': { value: 'Tue' }, 'D3': { value: 'Wed' }, 'E3': { value: 'Thu' }, 'F3': { value: 'Fri' }, 'G3': { value: 'Sat' }, 'H3': { value: 'Sun' }, 'I3': { value: 'Rate' },
        'A4': { value: 'Exercise' }, 'B4': { value: 'Y' }, 'C4': { value: 'N' }, 'D4': { value: 'Y' }, 'E4': { value: 'Y' }, 'F4': { value: 'N' }, 'G4': { value: 'Y' }, 'H4': { value: 'N' },
        'A5': { value: 'Read 30 min' }, 'B5': { value: 'Y' }, 'C5': { value: 'Y' }, 'D5': { value: 'Y' }, 'E5': { value: 'Y' }, 'F5': { value: 'Y' }, 'G5': { value: 'N' }, 'H5': { value: 'Y' },
        'A6': { value: 'Meditate' }, 'B6': { value: 'N' }, 'C6': { value: 'Y' }, 'D6': { value: 'N' }, 'E6': { value: 'Y' }, 'F6': { value: 'N' }, 'G6': { value: 'Y' }, 'H6': { value: 'Y' },
        'A7': { value: 'No sugar' }, 'B7': { value: 'Y' }, 'C7': { value: 'Y' }, 'D7': { value: 'N' }, 'E7': { value: 'Y' }, 'F7': { value: 'Y' }, 'G7': { value: 'Y' }, 'H7': { value: 'Y' },
        'A8': { value: 'Journal' }, 'B8': { value: 'Y' }, 'C8': { value: 'Y' }, 'D8': { value: 'Y' }, 'E8': { value: 'Y' }, 'F8': { value: 'Y' }, 'G8': { value: 'Y' }, 'H8': { value: 'Y' },
        'A10': { value: 'Completion Rate' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#E11D48', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3','G3','H3','I3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#E11D48' });
      state.setCellFormat('A10', { bold: true });
      break;
    }

    case 'create_medical_expenses': {
      const cells: Record<string, { value: string | number | boolean | null; formula?: string }> = {
        'A1': { value: 'Medical Expenses Tracker' },
        'A3': { value: 'Date' }, 'B3': { value: 'Provider' }, 'C3': { value: 'Service' }, 'D3': { value: 'Billed' }, 'E3': { value: 'Insurance' }, 'F3': { value: 'Out of Pocket' },
        'A4': { value: '2024-01-05' }, 'B4': { value: 'Dr. Smith' }, 'C4': { value: 'Annual physical' }, 'D4': { value: 300 }, 'E4': { value: 300 }, 'F4': { value: 0 },
        'A5': { value: '2024-01-15' }, 'B5': { value: 'Lab Corp' }, 'C5': { value: 'Blood work' }, 'D5': { value: 150 }, 'E5': { value: 120 }, 'F5': { value: 30 },
        'A6': { value: '2024-02-01' }, 'B6': { value: 'City Pharmacy' }, 'C6': { value: 'Prescription' }, 'D6': { value: 45 }, 'E6': { value: 35 }, 'F6': { value: 10 },
        'A7': { value: '2024-02-10' }, 'B7': { value: 'Dental Care' }, 'C7': { value: 'Cleaning' }, 'D7': { value: 200 }, 'E7': { value: 160 }, 'F7': { value: 40 },
        'A9': { value: 'TOTALS' },
        'D9': { value: null, formula: '=SUM(D4:D7)' }, 'E9': { value: null, formula: '=SUM(E4:E7)' }, 'F9': { value: null, formula: '=SUM(F4:F7)' },
      };
      state.bulkSetCells(cells);
      const hdr = { bold: true, bgColor: '#E11D48', fontColor: '#FFFFFF', textAlign: 'center' as const };
      ['A3','B3','C3','D3','E3','F3'].forEach((c) => state.setCellFormat(c, hdr));
      state.setCellFormat('A1', { bold: true, fontSize: 16, fontColor: '#E11D48' });
      state.setCellFormat('A9', { bold: true });
      ['D9','E9','F9'].forEach((c) => state.setCellFormat(c, { bold: true, bgColor: '#FFE4E6' }));
      break;
    }


    case 'analyze_data': {
      // Read-only — explanation is in the assistant message
      break
    }

    case 'clear_sheet': {
      _set((s: AppState) => {
        const sh = s.workbook.sheets.find((sheet: SheetData) => sheet.id === s.activeSheetId);
        if (sh) sh.cells = {};
      });
      break;
    }
  }
}

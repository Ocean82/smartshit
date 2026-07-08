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
  setContextMenu: (menu: { x: number; y: number; cell: string } | null) => void;

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
        set((s) => {
          const sheet = s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);
          if (!sheet) return;
          if (!sheet.cells[cellId]) {
            sheet.cells[cellId] = { value: null };
          }
          sheet.cells[cellId].format = { ...sheet.cells[cellId].format, ...format };
        });
      },

      setRangeFormat: (format) => {
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
              if (!sheet.cells[cid]) {
                sheet.cells[cid] = { value: null };
              }
              sheet.cells[cid].format = { ...sheet.cells[cid].format, ...format };
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
      setContextMenu: (menu) => set((s) => { s.contextMenu = menu; }),

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

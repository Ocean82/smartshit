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
import { executeTemplateTool, resolveGalleryTemplate } from '@/templates';
import { MUTATION_TOOL_NAMES } from '@shared/toolRegistry';
import { loadPersistedState } from '@/lib/persistence';
import { processMessage } from '@/ai/brain';
import { buildSpreadsheetContext } from '@/ai/buildContext';
import { toolResultToChatMessage, toolResultToMessage } from '@/ai/responseBuilder';
import { buildFilePreview } from '@/ai/filePreview';
import { recordTelemetry } from '@/ai/telemetry';
import { classifyMode, isLlmOnlyMode, isBudgetExplainQuery } from '@/ai/mode';
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/analysis/budget';
import { parseUserIntent } from '@/ai/intentParser';
import { AI_ANALYSIS_CONFIG } from '@/ai/config';
import { resolveActTemplates } from '@shared/actTemplates';
import { buildActionPreview } from '@/lib/previewBuilders';
import type { SheetInsights } from '@/ai/sheetInsights';
import type { AttachedFilePreview } from '@/ai/types';
import { computeSortedCellUpdates, findHeaderRow, findLastDataRow, type SortPatch } from '@/lib/sheetSort';
import { conditionToRule, attachConditionalRuleToColumn } from '@/lib/conditionalFormat';
import { v4 as uuid } from 'uuid';
import { defaultSkills } from '@/data/chatPresets';
import { validateCell } from '@/lib/validation';

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
  chatWidth: number;
  showFileExplorer: boolean;
  showSkills: boolean;
  showAuditPanel: boolean;
  showChartDialog: boolean;
  showFormatPanel: boolean;
  showVersionHistory: boolean;
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
  copiedRange: Selection | null;

  // Multi-range selection (Ctrl+click)
  additionalSelections: Selection[];

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
  addSelection: (sel: Selection) => void;
  setEditingCell: (cellId: string | null) => void;
  setEditValue: (val: string) => void;
  toggleChat: () => void;
  setShowChat: (v: boolean) => void;
  setChatWidth: (w: number) => void;
  toggleFileExplorer: () => void;
  toggleSkills: () => void;
  toggleAuditPanel: () => void;
  setShowChartDialog: (v: boolean) => void;
  setShowFormatPanel: (v: boolean) => void;
  setShowVersionHistory: (v: boolean) => void;
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
  clearChat: () => void;
  /** Build a template directly (gallery), bypassing the parser/LLM round-trip. */
  runTemplateTool: (tool: string) => void;
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
  updateChartPosition: (chartId: string, x: number, y: number) => void;
  setFreeze: (rows: number, cols: number) => void;
  setSortConfig: (config: SortConfig | null) => void;
  setFilters: (filters: FilterConfig[]) => void;
  sortByColumn: (column: number, direction: 'asc' | 'desc') => void;
  applySortPatch: (patch: SortPatch) => void;
  applyOuterBorders: (borderValue: string) => void;
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
  loadWorkbookData: (workbook: WorkbookData) => void;

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

    const storage = typeof localStorage !== 'undefined' ? localStorage : null
    const storedChatWidth = Number(storage?.getItem('smartsht-chat-width') || 380)
    const initialChatWidth = Number.isFinite(storedChatWidth)
      ? Math.min(720, Math.max(280, storedChatWidth))
      : 380
    const storedShowChat = storage?.getItem('smartsht-show-chat') ?? null
    const initialShowChat = storedShowChat === null ? true : storedShowChat !== '0'

    return {
      workbook: initialWorkbook,
      engine,
      activeSheetId: initialWorkbook.activeSheetId,
      selection: null,
      editingCell: null,
      editValue: '',
      showChat: initialShowChat,
      chatWidth: initialChatWidth,
      showFileExplorer: false,
      showSkills: false,
      showAuditPanel: false,
      showChartDialog: false,
      showFormatPanel: false,
      showVersionHistory: false,
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
      copiedRange: null,
      additionalSelections: [],
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
      toggleChat: () => set((s) => {
        s.showChat = !s.showChat
        try { localStorage.setItem('smartsht-show-chat', s.showChat ? '1' : '0') } catch { /* ignore */ }
      }),
      setShowChat: (v) => set((s) => {
        s.showChat = v
        try { localStorage.setItem('smartsht-show-chat', v ? '1' : '0') } catch { /* ignore */ }
      }),
      setChatWidth: (w) => set((s) => {
        const clamped = Math.min(720, Math.max(280, Math.round(w)))
        s.chatWidth = clamped
        try { localStorage.setItem('smartsht-chat-width', String(clamped)) } catch { /* ignore */ }
      }),
      toggleFileExplorer: () => set((s) => { s.showFileExplorer = !s.showFileExplorer; }),
      toggleSkills: () => set((s) => { s.showSkills = !s.showSkills; }),
      toggleAuditPanel: () => set((s) => { s.showAuditPanel = !s.showAuditPanel; }),
      setShowChartDialog: (v) => set((s) => { s.showChartDialog = v; }),
      setShowFormatPanel: (v) => set((s) => { s.showFormatPanel = v; }),
      setShowVersionHistory: (v) => set((s) => { s.showVersionHistory = v; }),
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
        return validateCell(value, cell.validation);
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

      clearChat: () => set((s) => {
        s.messages = [{
          id: uuid(),
          role: 'assistant',
          content: `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nI only apply changes after you review and approve them.`,
          timestamp: Date.now(),
        }];
        s.chatInput = '';
        s.isAiProcessing = false;
      }),

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
          const headerRowIdx = findHeaderRow(sheet);
          const lastDataRowIdx = findLastDataRow(sheet);
          let lastDataColIdx = 0;
          const headers: string[] = [];
          for (const cellId of Object.keys(sheet.cells)) {
            lastDataColIdx = Math.max(lastDataColIdx, cellToRef(cellId).col);
          }
          for (let c = 0; c <= lastDataColIdx; c++) {
            headers.push(state.getComputedValue(headerRowIdx, c));
          }
          const parsed = parseMessage(input, {
            headerRow: headerRowIdx,
            lastDataRow: lastDataRowIdx,
            lastDataCol: lastDataColIdx,
            headers,
          });
          if (parsed.understood && parsed.calls.length > 0) {
            // Push a single undo point BEFORE the batch executes
            get().pushHistory(`AI: ${parsed.explanation || parsed.calls.map(c => c.description).join(', ')}`);

            // Shared execution context — suppress per-tool pushHistory since we already saved the undo point
            const execCtx = buildExecutionContext(get, set, { suppressHistory: true });

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

          // ─── Gallery template prompt (instant build, no LLM) ────────────────
          // Matches prompts/names from src/data/templates.ts so niche templates
          // work from typed chat the same way they do from the gallery.
          const galleryMatch = resolveGalleryTemplate(input);
          if (galleryMatch) {
            get().pushHistory(`Template: ${galleryMatch.label}`);
            const execCtx = buildExecutionContext(get, set, { suppressHistory: true });
            const result = executeTemplateTool(galleryMatch.tool, {}, execCtx);
            const responseText = result.success
              ? `✓ ${result.message}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} filled)` : ''}`
              : `⚠️ ${result.message}`;

            set((s) => {
              const idx = s.messages.findIndex((m) => m.id === streamingMsgId);
              if (idx >= 0) {
                s.messages[idx] = {
                  id: streamingMsgId,
                  role: 'assistant',
                  content: responseText,
                  timestamp: Date.now(),
                };
              }
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
            previewContext: {
              sheet,
              getComputedValue: state.getComputedValue,
            },
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

      runTemplateTool: (tool) => {
        get().setShowChat(true);
        const label = tool.replace(/^create_/, '').replace(/_/g, ' ');
        get().pushHistory(`Template: ${label}`);
        const ctx = buildExecutionContext(get, set, { suppressHistory: true });
        const result = executeTemplateTool(tool, {}, ctx);
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          content: result.success
            ? `✓ ${result.message}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} filled)` : ''}`
            : `⚠️ ${result.message}`,
          timestamp: Date.now(),
        });
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

        const sheetLines = workbook.sheets.map((s) => {
          const keys = Object.keys(s.cells);
          const rows = keys.length === 0
            ? 0
            : Math.max(...keys.map((id) => cellToRef(id).row)) + 1;
          return { name: s.name, rows };
        });
        const activeRows = sheetLines.find((s) => s.name === sheet?.name)?.rows ?? 0;
        const fileLabel = meta?.fileName ?? 'your file';
        const multi = workbook.sheets.length > 1;
        const sheetList = sheetLines
          .map((s) => `**${s.name}** (${s.rows} row${s.rows === 1 ? '' : 's'})`)
          .join(', ');
        const importMessage = multi
          ? `Imported **${fileLabel}** with **${workbook.sheets.length} sheets**: ${sheetList}.\n\nYou're on **${sheet?.name ?? 'Sheet1'}**. Use the sheet tabs at the bottom to switch — I analyze the active sheet.`
          : `Imported **${fileLabel}** — ${activeRows} rows on **${sheet?.name ?? 'Sheet 1'}**. Analyzing your data now…`;

        set((s) => {
          s.workbook = workbook;
          s.activeSheetId = workbook.activeSheetId;
          s.undoStack = [];
          s.redoStack = [];
          s.workbook.updatedAt = Date.now();
          s.messages.push({
            id: uuid(),
            role: 'assistant',
            content: importMessage,
            timestamp: Date.now(),
            suggestions: multi
              ? sheetLines.slice(0, 4).map((s) => `Explain the "${s.name}" sheet`)
              : undefined,
          });
        });

        // Auto-analyze: trigger an explain message after import
        if (activeRows > 0) {
          setTimeout(() => {
            set((s) => {
              s.chatInput = multi
                ? `Explain the "${sheet?.name ?? 'active'}" sheet and highlight key insights. Mention the other sheets briefly.`
                : 'Explain this spreadsheet and highlight key insights';
            });
            get().sendMessage();
          }, 300);
        }
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

  // Act mode — gallery templates first (all 55 specs), then shared actTemplates
  if (mode === 'act') {
    const galleryMatch = resolveGalleryTemplate(input);
    if (galleryMatch) {
      return {
        id: uuid(),
        role: 'assistant',
        content: `I will build **${galleryMatch.name}** for you. Click Apply to confirm.`,
        timestamp: Date.now(),
        actions: [{
          id: uuid(),
          tool: galleryMatch.tool,
          params: {},
          description: `Create ${galleryMatch.name}`,
          status: 'pending' as const,
        }],
      };
    }

    const template = resolveActTemplates(input);
    if (template.actions.length > 0 || template.message) {
      const sheet = get().getActiveSheet();
      return {
        id: uuid(),
        role: 'assistant',
        content: template.message,
        timestamp: Date.now(),
        actions: template.actions.map((action) => {
          const preview = buildActionPreview(
            action.tool,
            action.params,
            sheet,
            get().getComputedValue,
          );
          return {
            id: uuid(),
            tool: action.tool,
            params: action.params,
            description: action.description,
            status: 'pending' as const,
            preview,
          };
        }),
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

/** Cell ids covered by the current selection rectangle. */
function selectionCellIds(sel: Selection | null): string[] {
  if (!sel) return [];
  const ids: string[] = [];
  for (let r = Math.min(sel.startRow, sel.endRow); r <= Math.max(sel.startRow, sel.endRow); r++) {
    for (let c = Math.min(sel.startCol, sel.endCol); c <= Math.max(sel.startCol, sel.endCol); c++) {
      ids.push(refToCell(r, c));
    }
  }
  return ids;
}

/**
 * Build the ExecutionContext used by both the fast path (parser) and the
 * LLM Apply path — so all mutation tools run through the same executor logic.
 */
function buildExecutionContext(
  get: () => AppState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: any,
  opts?: { suppressHistory?: boolean },
): ExecutionContext {
  const ctx: ExecutionContext = {
    getActiveSheet: () => get().getActiveSheet(),
    getComputedValue: (row, col) => get().getComputedValue(row, col),
    setCellValue: (cellId, value, formula) => get().setCellValue(cellId, value, formula),
    setCellFormat: (cellId, format) => get().setCellFormat(cellId, format),
    bulkSetCells: (cells) => get().bulkSetCells(cells),
    applySortPatch: (patch) => get().applySortPatch(patch),
    setFilters: (filters) => get().setFilters(filters),
    deleteRow: (row) => get().deleteRow(row),
    insertRow: (afterRow) => get().insertRow(afterRow),
    addSheet: (name) => get().addSheet(name),
    renameSheet: (sheetId, name) => get().renameSheet(sheetId, name),
    pushHistory: opts?.suppressHistory ? () => {} : (desc) => get().pushHistory(desc),
    getSelection: () => {
      const state = get();
      const primary = selectionCellIds(state.selection);
      const additional = state.additionalSelections.flatMap((s) => selectionCellIds(s));
      if (additional.length === 0) return primary;
      return [...new Set([...primary, ...additional])];
    },
    addChart: (chart) => get().addChart(chart),
  };
  ctx.executeTemplate = (tool, params) => executeTemplateTool(tool, params, ctx);
  return ctx;
}

// Execute AI actions — operational (mutation) tools run through the unified
// agent executor; create_* templates run through the template module (src/templates).
function executeAction(
  action: AgentAction,
  get: () => AppState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: any
) {
  const ctx = buildExecutionContext(get, set, { suppressHistory: true });
  if (MUTATION_TOOL_NAMES.includes(action.tool)) {
    // applyAction already pushed a single undo point for this action
    executeTool({ tool: action.tool, params: action.params, description: action.description }, ctx);
    return;
  }
  executeTemplateTool(action.tool, action.params, ctx);
}

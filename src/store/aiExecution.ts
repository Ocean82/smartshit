/**
 * AI / macro execution helpers used by store chat actions.
 * Extracted from useStore to keep the composed store thin.
 */

import type { ChatMessage, AgentAction, Selection } from '@/types'
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { executeTool, executeToolAsync, type ExecutionContext, type ExecutionResult } from '@/agent'
import { executeTemplateTool, resolveGalleryTemplate } from '@/templates'
import { MUTATION_TOOL_NAMES } from '@shared/toolRegistry'
import { executeMacro } from '@/ai/macro/macroExecutor'
import { createStoreUndoManager } from '@/ai/macro/storeUndoManager'
import { createToolStepExecutor } from '@/ai/macro/toolStepExecutor'
import type { ActionStep, MacroPlan } from '@/ai/nlp/types'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { toolResultToMessage } from '@/ai/responseBuilder'
import { classifyMode, isLlmOnlyMode, isBudgetExplainQuery } from '@/ai/mode'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/analysis/budget'
import { parseUserIntent } from '@shared/intentParser'
import { resolveActTemplates } from '@shared/actTemplates'
import { buildActionPreview } from '@/lib/previewBuilders'
import { exportSheetToCsv, exportWorkbookToXlsx } from '@/io/xlsx'
import { exportWorkbookToJson } from '@/io/workbookJson'
import { v4 as uuid } from 'uuid'
import { MAX_UNDO_STACK, type AppState, type StoreGet, type StoreSet } from './storeTypes'

// AI Command Processing (local fallback when server is unavailable)
export function processAICommand(
  input: string,
  get: StoreGet
): ChatMessage {
  const mode = classifyMode(input);
  const lower = input.toLowerCase();

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

export function estimateActionChangeCount(action: AgentAction): number {
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
export function selectionCellIds(sel: Selection | null): string[] {
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
export function buildExecutionContext(
  get: StoreGet,
  set: StoreSet,
  opts?: { suppressHistory?: boolean },
): ExecutionContext {
  const ctx: ExecutionContext = {
    getActiveSheet: () => get().getActiveSheet(),
    getSheets: () => get().workbook.sheets,
    getComputedValue: (row, col, sheetId) => {
      if (sheetId) {
        const state = get();
        const targetSheet = state.workbook.sheets.find((candidate) => candidate.id === sheetId);
        const cell = targetSheet?.cells[refToCell(row, col)];
        if (cell?.formula && state.engine.isAIFormula(cell.formula)) {
          return cell.displayValue == null ? String(cell.value ?? '') : String(cell.displayValue);
        }
        return state.engine.getComputedValue(sheetId, row, col);
      }
      return get().getComputedValue(row, col);
    },
    setCellValue: (cellId, value, formula) => get().setCellValue(cellId, value, formula),
    setCellFormat: (cellId, format) => get().setCellFormat(cellId, format),
    setCellValidation: (cellId, validation) => {
      set((s: AppState) => {
        const sheet = s.workbook.sheets.find((sh: { id: string }) => sh.id === s.activeSheetId);
        if (!sheet) return;
        if (!sheet.cells[cellId]) {
          sheet.cells[cellId] = { value: null };
        }
        if (validation) {
          sheet.cells[cellId].validation = validation;
        } else {
          delete sheet.cells[cellId].validation;
        }
      });
    },
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
    exportData: (format) => {
      const state = get();
      if (format === 'csv') {
        exportSheetToCsv(state.getActiveSheet(), state.workbook.name.replace(/\s+/g, '_'));
      } else if (format === 'xlsx') {
        exportWorkbookToXlsx(state.workbook);
      } else {
        exportWorkbookToJson(state.workbook);
      }
    },
  };
  ctx.executeTemplate = (tool, params) => executeTemplateTool(tool, params, ctx);
  return ctx;
}

// Execute AI actions — operational (mutation) tools run through the unified
// agent executor; create_* templates run through the template module (src/templates).
export function executeAction(
  action: AgentAction,
  get: StoreGet,
  set: StoreSet
): ExecutionResult | Promise<ExecutionResult> {
  const ctx = buildExecutionContext(get, set, { suppressHistory: true });
  if (action.tool === 'execute_macro') {
    return executeMacroAction(action, get, set);
  }
  if (action.tool === 'execute_script') {
    // Validate that code is a non-empty string before passing to the sandbox.
    // params.code originates from LLM output and must not be run unsanitized.
    const rawCode = action.params.code;
    if (typeof rawCode !== 'string' || !rawCode.trim()) {
      return { success: false, message: 'execute_script requires a non-empty string code parameter', modified: 0 };
    }
    return executeToolAsync(
      { tool: action.tool, params: { ...action.params, code: rawCode }, description: action.description },
      ctx,
    );
  }
  if (MUTATION_TOOL_NAMES.includes(action.tool)) {
    // applyAction already pushed a single undo point for this action
    return executeTool({ tool: action.tool, params: action.params, description: action.description }, ctx);
  }
  return executeTemplateTool(action.tool, action.params, ctx);
}

/**
 * Run a multi-step macro as one undoable group.
 * On success, push a single HistoryEntry with structural before/after snapshots.
 */
export async function executeMacroAction(
  action: AgentAction,
  get: StoreGet,
  set: StoreSet,
): Promise<ExecutionResult> {
  const rawSteps = action.params.steps;
  const steps: ActionStep[] = Array.isArray(rawSteps)
    ? rawSteps.map((s) => ({
        tool: String((s as ActionStep).tool ?? ''),
        params: ((s as ActionStep).params ?? {}) as Record<string, unknown>,
        description: String((s as ActionStep).description ?? (s as ActionStep).tool ?? 'step'),
      }))
    : [];

  if (steps.length === 0) {
    return { success: false, message: 'execute_macro requires a non-empty steps array', modified: 0 };
  }

  const label = action.description || `Macro: ${steps.length} steps`;
  const before = structuredClone(get().workbook);

  const undoManager = createStoreUndoManager({
    getWorkbook: () => get().workbook,
    restoreWorkbook: (wb) => {
      get().engine.loadWorkbook(wb);
      set((s: AppState) => {
        s.workbook = wb;
        s.activeSheetId = wb.activeSheetId;
      });
    },
  });

  const stepExecutor = createToolStepExecutor(
    () => buildExecutionContext(get, set, { suppressHistory: true }),
  );

  const plan: MacroPlan = {
    steps,
    originalText: label,
    truncated: false,
  };

  const result = await executeMacro(
    plan,
    {
      onProgress() {},
      onStepComplete() {},
      shouldCancel: () => false,
    },
    undoManager,
    stepExecutor,
  );

  if (result.success) {
    const after = structuredClone(get().workbook);
    set((s: AppState) => {
      s.undoStack.push({
        patch: {
          sheets: [],
          activeSheetIdBefore: before.activeSheetId,
          activeSheetIdAfter: after.activeSheetId,
          structuralBefore: before,
          structuralAfter: after,
        },
        description: label.startsWith('Macro:') ? label : `Macro: ${label}`,
      });
      if (s.undoStack.length > MAX_UNDO_STACK) s.undoStack.shift();
      s.redoStack = [];
    });

    const modified = result.completedSteps.reduce((sum, step) => {
      const data = step.result.data as { modified?: number } | undefined;
      return sum + (typeof data?.modified === 'number' ? data.modified : 0);
    }, 0);

    return {
      success: true,
      message: `Macro completed (${result.completedSteps.length} steps)`,
      modified,
    };
  }

  const reason = result.failedStep?.reason ?? 'Macro failed';
  return { success: false, message: reason, modified: 0 };
}

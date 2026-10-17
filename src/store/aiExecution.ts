/**
 * AI / macro execution helpers used by store chat actions.
 * Extracted from useStore to keep the composed store thin.
 */

import type { ChatMessage, AgentAction, Selection, WorkbookData, SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'
import { setColAt } from '@/lib/colLayout'
import { setRowAt, getRowHeight } from '@/lib/rowLayout'
import { autoFitRowHeights, createCanvasTextMeasurer } from '@/lib/rowAutoFit'
import { executeTool, executeToolAsync, type ExecutionContext, type ExecutionResult } from '@/agent'
import { executeTemplateTool, resolveGalleryTemplate } from '@/templates'
import { MUTATION_TOOL_NAMES } from '@shared/toolRegistry'
import { executeMacro } from '@/ai/macro/macroExecutor'
import { createSharedSnapshotUndoManager } from '@/ai/macro/storeUndoManager'
import { createToolStepExecutor } from '@/ai/macro/toolStepExecutor'
import type { ActionStep, MacroPlan } from '@/ai/nlp/types'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { toolResultToMessage } from '@/ai/responseBuilder'
import { recordTelemetry } from '@/ai/telemetry'
import { classifyMode, isLlmOnlyMode, isBudgetExplainQuery } from '@/ai/mode'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/analysis/budget'
import { parseUserIntent } from '@shared/intentParser'
import { resolveActTemplates } from '@shared/actTemplates'
import { buildActionPreview } from '@/lib/previewBuilders'
import { capUndoStack, diffWorkbooks, newHistoryEntryId } from '@/lib/historyDiff'
import {
  isScriptPatchEmpty,
  scriptPatchOperationCount,
  scriptPatchSignature,
  type ScriptPatch,
} from '@/lib/scriptPatch'
import { exportSheetToCsv, exportWorkbookToXlsx } from '@/io/xlsx'
import { exportWorkbookToJson } from '@/io/workbookJson'
import { v4 as uuid } from 'uuid'
import { MAX_UNDO_STACK, MAX_UNDO_STACK_BYTES, MIN_UNDO_STACK_ENTRIES, type AppState, type StoreGet, type StoreSet } from './storeTypes'

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
        insightsSnapshot: {
          insights: insights as unknown as Record<string, unknown>,
          scope: {
            workbookId: state.workbook.id,
            sheetId: state.activeSheetId,
            revision: state.workbookRevision,
          },
        },
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
  opts?: { suppressHistory?: boolean; targetSheetId?: string },
): ExecutionContext {
  // When a macro captures its target sheet at apply time (FEAT-002 #3), every
  // formatting/layout setter must operate on THAT sheet, not the live active
  // sheet — otherwise switching tabs mid-run redirects later steps elsewhere.
  const targetSheetId = opts?.targetSheetId;
  // Resolve the sheet the macro targets, falling back to the active sheet if
  // the captured id no longer exists (e.g. the target sheet was deleted).
  const resolveTargetSheet = (s: AppState): SheetData | undefined =>
    targetSheetId
      ? (s.workbook.sheets.find((sh) => sh.id === targetSheetId) ?? s.workbook.sheets.find((sh) => sh.id === s.activeSheetId))
      : s.workbook.sheets.find((sh) => sh.id === s.activeSheetId);

  const ctx: ExecutionContext = {
    getActiveSheet: () => {
      if (targetSheetId) {
        const sheet = get().workbook.sheets.find((sh) => sh.id === targetSheetId);
        if (sheet) return sheet;
      }
      return get().getActiveSheet();
    },
    getSheets: () => get().workbook.sheets,
    getComputedValue: (row, col, sheetId) => {
      // Default unscoped reads to the macro's target sheet when one is set.
      const effectiveSheetId = sheetId ?? targetSheetId;
      if (effectiveSheetId) {
        const state = get();
        const targetSheet = state.workbook.sheets.find((candidate) => candidate.id === effectiveSheetId);
        const cell = targetSheet?.cells[refToCell(row, col)];
        if (cell?.formula && state.engine.isAIFormula(cell.formula)) {
          return cell.displayValue == null ? String(cell.value ?? '') : String(cell.displayValue);
        }
        return state.engine.getComputedValue(effectiveSheetId, row, col);
      }
      return get().getComputedValue(row, col);
    },
    setCellValue: (cellId, value, formula) => get().setCellValue(cellId, value, formula),
    setCellFormat: (cellId, format) => {
      if (!targetSheetId) {
        get().setCellFormat(cellId, format);
        return;
      }
      // Sheet-scoped mirror of workbookSlice.setCellFormat so a mid-run tab
      // switch cannot divert the makeover's formatting to another sheet.
      set((s: AppState) => {
        const sheet = resolveTargetSheet(s);
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
        s.workbook.updatedAt = Date.now();
      });
    },
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
    // Layout hooks mutate directly and do NOT push history — the tool handler
    // owns the single undo point (suppressed here in the LLM Apply path, where
    // applyAction already pushed one; active in the fast/parser path).
    setColumnWidth: (col, width) => {
      if (col < 0) return;
      set((s: AppState) => {
        const sh = resolveTargetSheet(s);
        if (!sh) return;
        sh.columnWidths = setColAt(sh.columnWidths, col, width);
        s.workbook.updatedAt = Date.now();
      });
    },
    setRowHeight: (row, height) => {
      if (row < 0) return;
      set((s: AppState) => {
        const sh = resolveTargetSheet(s);
        if (!sh) return;
        sh.rowHeights = setRowAt(sh.rowHeights, row, height);
        s.workbook.updatedAt = Date.now();
      });
    },
    autoFitRows: (rows) => {
      const unique = [...new Set(rows.filter((r) => r >= 0 && Number.isFinite(r)))];
      if (unique.length === 0) return 0;
      const sheet = ctx.getActiveSheet();
      const next = autoFitRowHeights(sheet, unique, (row, col) => {
        const computed = ctx.getComputedValue(row, col);
        return computed || String(sheet.cells[refToCell(row, col)]?.value ?? '');
      }, createCanvasTextMeasurer());
      const changed = unique.filter((r) => getRowHeight(next, r) !== getRowHeight(sheet.rowHeights, r));
      if (changed.length === 0) return 0;
      set((s: AppState) => {
        const sh = resolveTargetSheet(s);
        if (!sh) return;
        sh.rowHeights = next;
        s.workbook.updatedAt = Date.now();
      });
      return changed.length;
    },
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
 * A shallow view of `wb` that exposes only the one sheet `targetSheetId`
 * identifies (or an empty sheet list if it no longer exists). Used to constrain
 * `diffWorkbooks` so a macro's undo entry captures changes to the target sheet
 * only — concurrent edits on other sheets are left out (FEAT-002 #2).
 *
 * The sheet object is shared by reference (not cloned): diffWorkbooks reads it
 * and never mutates its inputs, so this stays O(1) regardless of workbook size.
 */
function restrictWorkbookToSheet(wb: WorkbookData, targetSheetId: string): WorkbookData {
  const sheet = wb.sheets.find((s) => s.id === targetSheetId);
  return {
    ...wb,
    sheets: sheet ? [sheet] : [],
    activeSheetId: targetSheetId,
  };
}

/**
 * Roll a macro back by restoring ONLY the target sheet from `snapshot`, leaving
 * every other sheet's live state intact. A whole-workbook replace would erase a
 * concurrent edit made elsewhere during the run (FEAT-002 #2). Falls back to a
 * full restore when the target sheet is absent from the live workbook (e.g. it
 * was deleted mid-run) so a failed macro never leaves a half-applied sheet.
 */
function restoreSheetFromSnapshot(
  snapshot: WorkbookData,
  targetSheetId: string,
  get: StoreGet,
  set: StoreSet,
): void {
  const snapSheet = snapshot.sheets.find((s) => s.id === targetSheetId);
  const liveHasTarget = get().workbook.sheets.some((s) => s.id === targetSheetId);
  if (!snapSheet || !liveHasTarget) {
    restoreWorkbookSnapshot(snapshot, get, set);
    return;
  }
  const restoredSheet = structuredClone(snapSheet);
  set((s: AppState) => {
    const idx = s.workbook.sheets.findIndex((sh) => sh.id === targetSheetId);
    if (idx === -1) return;
    s.workbook.sheets[idx] = restoredSheet;
    s.workbook.updatedAt = Date.now();
  });
  get().engine.loadWorkbook(get().workbook);
}

/**
 * Restore a whole-workbook snapshot. Used to roll back a failed commit so a
 * partially applied action never leaves the sheet half-changed.
 */
function restoreWorkbookSnapshot(snapshot: WorkbookData, get: StoreGet, set: StoreSet): void {
  get().engine.loadWorkbook(snapshot)
  set((s: AppState) => {
    s.workbook = snapshot
    s.activeSheetId = snapshot.activeSheetId
  })
}

/**
 * Commit a locally prepared, user-reviewed script patch.
 *
 * This deliberately does NOT re-run the script: the dry-run already collected
 * the exact mutation set the user approved, so re-executing could produce
 * different values if the sheet moved underneath us. It also does NOT rely on
 * `pushHistory()`'s microtask diff — the mutation happens here, synchronously,
 * between two explicit snapshots, so undo/redo get one correct entry.
 *
 * On any failure the whole commit is rolled back.
 */
export async function applyPreparedScriptAction(
  action: AgentAction,
  get: StoreGet,
  set: StoreSet,
): Promise<ExecutionResult> {
  const prepared = action.prepared
  if (!prepared || prepared.kind !== 'script') {
    return {
      success: false,
      message: 'This action has no reviewed changes to apply. Ask me to regenerate it.',
      modified: 0,
    }
  }

  const patch: ScriptPatch = prepared.patch
  if (scriptPatchSignature(patch) !== prepared.signature) {
    return {
      success: false,
      message: 'The reviewed changes no longer match this action. Ask me to regenerate it.',
      modified: 0,
    }
  }

  if (isScriptPatchEmpty(patch)) {
    return { success: true, message: 'Nothing to change — the reviewed script made no edits.', modified: 0 }
  }

  const before = structuredClone(get().workbook)
  const ctx = buildExecutionContext(get, set, { suppressHistory: true })

  try {
    if (Object.keys(patch.cellUpdates).length > 0) ctx.bulkSetCells(patch.cellUpdates)
    for (const [cellId, format] of Object.entries(patch.formatUpdates)) {
      ctx.setCellFormat(cellId, format)
    }
    for (const row of patch.rowDeletions) ctx.deleteRow(row)
    for (const afterRow of patch.rowInsertions) ctx.insertRow(afterRow)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    restoreWorkbookSnapshot(before, get, set)
    return {
      success: false,
      message: `The script changes could not be applied and were rolled back: ${detail}`,
      modified: 0,
    }
  }

  const after = get().workbook
  const diff = diffWorkbooks(before, after)
  const description = action.description || 'AI script changes'
  set((s: AppState) => {
    s.undoStack.push({ id: newHistoryEntryId(), patch: diff, description })
    capUndoStack(s.undoStack, {
      maxEntries: MAX_UNDO_STACK,
      maxBytes: MAX_UNDO_STACK_BYTES,
      minEntries: MIN_UNDO_STACK_ENTRIES,
    })
    s.redoStack = []
  })

  const modified = scriptPatchOperationCount(patch)
  recordTelemetry('sandboxExecutions', `${modified} committed changes from reviewed patch`)

  return {
    success: true,
    message: `Applied the reviewed changes (${modified} operation${modified === 1 ? '' : 's'}).`,
    modified,
  }
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
  // FEAT-002 #3: capture the sheet active at Apply time BEFORE any step runs,
  // so every step formats that sheet even if the user switches tabs mid-run.
  const targetSheetId = get().activeSheetId;
  // Single full-workbook clone for both rollback and (on success) undo history.
  const before = structuredClone(get().workbook);

  const undoManager = createSharedSnapshotUndoManager({
    before,
    // FEAT-002 #2: on rollback restore ONLY the target sheet from `before` and
    // keep every other sheet's live state, so a concurrent edit elsewhere is
    // not erased by a failed macro.
    restoreWorkbook: (wb) => {
      restoreSheetFromSnapshot(wb, targetSheetId, get, set);
    },
  });

  const stepExecutor = createToolStepExecutor(
    () => buildExecutionContext(get, set, { suppressHistory: true, targetSheetId }),
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
    // Diff before→after into a minimal patch instead of storing two full
    // workbook clones. A macro that touches a few cells now costs a few cells
    // of history, not 2× the whole workbook. diffWorkbooks still falls back to
    // full structuralBefore/structuralAfter snapshots automatically when the
    // macro changed sheet structure (add/remove/reorder), so undo stays exact.
    //
    // FEAT-002 #2: restrict the diff inputs to the target sheet so a concurrent
    // edit on ANOTHER sheet during the run is excluded from this undo entry —
    // undoing the macro must not revert that unrelated edit.
    const patch = diffWorkbooks(
      restrictWorkbookToSheet(before, targetSheetId),
      restrictWorkbookToSheet(get().workbook, targetSheetId),
    );
    const description = label.startsWith('Macro:') ? label : `Macro: ${label}`;
    set((s: AppState) => {
      s.undoStack.push({ id: newHistoryEntryId(), patch, description });
      // Structural macros still carry full snapshots, so keep enforcing the
      // byte budget (a no-op for the now-common lightweight cell-diff case).
      capUndoStack(s.undoStack, {
        maxEntries: MAX_UNDO_STACK,
        maxBytes: MAX_UNDO_STACK_BYTES,
        minEntries: MIN_UNDO_STACK_ENTRIES,
      });
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

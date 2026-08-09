/**
 * Spreadsheet Selector Hooks
 *
 * Decouples components from the Zustand store by providing
 * focused, memoized selectors. Reduces re-renders and improves testability.
 */

import { useStore } from '@/store/useStore';
import { useMemo } from 'react';

// ─── Core State ────────────────────────────────────────────────────────────────

/** Get the currently active sheet */
export function useActiveSheet() {
  return useStore((s) => s.getActiveSheet());
}

/** Get the current workbook */
export function useWorkbook() {
  return useStore((s) => s.workbook);
}

/** Get the active sheet ID */
export function useActiveSheetId() {
  return useStore((s) => s.activeSheetId);
}

/** Get the cell selection */
export function useSelection() {
  return useStore((s) => s.selection);
}

/** Get additional (multi-range) selections */
export function useAdditionalSelections() {
  return useStore((s) => s.additionalSelections);
}

/** Get the currently editing cell ID */
export function useEditingCell() {
  return useStore((s) => s.editingCell);
}

/** Get the current edit value */
export function useEditValue() {
  return useStore((s) => s.editValue);
}

/** Get all cell data for the active sheet */
export function useActiveSheetCells() {
  const sheet = useActiveSheet();
  return useMemo(() => sheet.cells, [sheet.cells]);
}

// ─── Computed Values ──────────────────────────────────────────────────────────

/** Get computed value for a specific cell */
export function useComputedValue(row: number, col: number): string {
  return useStore((s) => s.getComputedValue(row, col));
}

/** Get computed value for a specific cell by ID */
export function useComputedValueById(cellId: string): string {
  const { row, col } = useMemo(() => {
    const match = cellId.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return { row: 0, col: 0 };
    return { row: parseInt(match[2], 10) - 1, col: match[1].toUpperCase().charCodeAt(0) - 65 };
  }, [cellId]);
  return useComputedValue(row, col);
}

// ─── Actions ───────────────────────────────────────────────────────────────────

/** Set a cell value (with formula support) */
export function useSetCellValue() {
  return useStore((s) => s.setCellValue);
}

/** Set cell format */
export function useSetCellFormat() {
  return useStore((s) => s.setCellFormat);
}

/** Set range format */
export function useSetRangeFormat() {
  return useStore((s) => s.setRangeFormat);
}

/** Push to history stack */
export function usePushHistory() {
  return useStore((s) => s.pushHistory);
}

/** Undo last action */
export function useUndo() {
  return useStore((s) => s.undo);
}

/** Redo last action */
export function useRedo() {
  return useStore((s) => s.redo);
}

/** Set cell validation */
export function useSetCellValidation() {
  return useStore((s) => s.setCellValidation);
}

/** Validate cell value */
export function useValidateCellValue() {
  return useStore((s) => s.validateCellValue);
}

// ─── Selection Actions ─────────────────────────────────────────────────────────

/** Set selection */
export function useSetSelection() {
  return useStore((s) => s.setSelection);
}

/** Add additional selection (Ctrl+click) */
export function useAddSelection() {
  return useStore((s) => s.addSelection);
}

/** Set editing cell */
export function useSetEditingCell() {
  return useStore((s) => s.setEditingCell);
}

/** Set edit value */
export function useSetEditValue() {
  return useStore((s) => s.setEditValue);
}

// ─── Sheet Actions ─────────────────────────────────────────────────────────────

/** Set active sheet */
export function useSetActiveSheet() {
  return useStore((s) => s.setActiveSheet);
}

/** Add a new sheet */
export function useAddSheet() {
  return useStore((s) => s.addSheet);
}

/** Delete a sheet */
export function useDeleteSheet() {
  return useStore((s) => s.deleteSheet);
}

/** Rename a sheet */
export function useRenameSheet() {
  return useStore((s) => s.renameSheet);
}

/** Load workbook data */
export function useLoadWorkbookData() {
  return useStore((s) => s.loadWorkbookData);
}

/** Import workbook */
export function useImportWorkbook() {
  return useStore((s) => s.importWorkbook);
}

/** Bulk set cells */
export function useBulkSetCells() {
  return useStore((s) => s.bulkSetCells);
}

/** Get cell data */
export function useGetCellData() {
  return useStore((s) => s.getCellData);
}

/** Delete selected cells */
export function useDeleteSelectedCells() {
  return useStore((s) => s.deleteSelectedCells);
}

// ─── Row/Column Actions ────────────────────────────────────────────────────────

/** Insert row */
export function useInsertRow() {
  return useStore((s) => s.insertRow);
}

/** Insert column */
export function useInsertColumn() {
  return useStore((s) => s.insertColumn);
}

/** Delete row */
export function useDeleteRow() {
  return useStore((s) => s.deleteRow);
}

/** Delete column */
export function useDeleteColumn() {
  return useStore((s) => s.deleteColumn);
}

// ─── Sort/Filter Actions ───────────────────────────────────────────────────────

/** Sort by column */
export function useSortByColumn() {
  return useStore((s) => s.sortByColumn);
}

/** Multi-sort */
export function useMultiSort() {
  return useStore((s) => s.multiSort);
}

/** Apply sort patch */
export function useApplySortPatch() {
  return useStore((s) => s.applySortPatch);
}

/** Set sort config */
export function useSetSortConfig() {
  return useStore((s) => s.setSortConfig);
}

/** Set filters */
export function useSetFilters() {
  return useStore((s) => s.setFilters);
}

// ─── Chart Actions ─────────────────────────────────────────────────────────────

/** Add chart */
export function useAddChart() {
  return useStore((s) => s.addChart);
}

/** Remove chart */
export function useRemoveChart() {
  return useStore((s) => s.removeChart);
}

/** Update chart position */
export function useUpdateChartPosition() {
  return useStore((s) => s.updateChartPosition);
}

// ─── Conditional Format ────────────────────────────────────────────────────────

/** Apply conditional format */
export function useApplyConditionalFormat() {
  return useStore((s) => s.applyConditionalFormat);
}

// ─── Scroll ────────────────────────────────────────────────────────────────────

/** Set scroll position */
export function useSetScrollPosition() {
  return useStore((s) => s.setScrollPosition);
}

/** Get scroll position */
export function useScrollPosition() {
  return useStore((s) => ({ scrollRow: s.scrollRow, scrollCol: s.scrollCol }));
}

// ─── Chat State ────────────────────────────────────────────────────────────────

/** Chat message list */
export function useMessages() {
  return useStore((s) => s.messages);
}

/** Current chat input */
export function useChatInput() {
  return useStore((s) => s.chatInput);
}

/** Whether the AI is processing a reply */
export function useIsAiProcessing() {
  return useStore((s) => s.isAiProcessing);
}

/** Chat skill chips */
export function useSkills() {
  return useStore((s) => s.skills);
}

/** Attached file preview for chat import */
export function useAttachedFilePreview() {
  return useStore((s) => s.attachedFilePreview);
}

/** Chat panel visibility */
export function useShowChat() {
  return useStore((s) => s.showChat);
}

/** Chat panel width */
export function useChatWidth() {
  return useStore((s) => s.chatWidth);
}

/** Run a gallery template tool */
export function useRunTemplateTool() {
  return useStore((s) => s.runTemplateTool);
}

// ─── Chat Actions ──────────────────────────────────────────────────────────────

/** Send chat message */
export function useSendMessage() {
  return useStore((s) => s.sendMessage);
}

/** Set chat input */
export function useSetChatInput() {
  return useStore((s) => s.setChatInput);
}

/** Add chat message */
export function useAddMessage() {
  return useStore((s) => s.addMessage);
}

/** Clear chat */
export function useClearChat() {
  return useStore((s) => s.clearChat);
}

/** Toggle pin message */
export function useTogglePinMessage() {
  return useStore((s) => s.togglePinMessage);
}

/** Get pinned messages */
export function useGetPinnedMessages() {
  return useStore((s) => s.getPinnedMessages);
}

// ─── AI Actions ────────────────────────────────────────────────────────────────

/** Apply AI action */
export function useApplyAction() {
  return useStore((s) => s.applyAction);
}

/** Reject AI action */
export function useRejectAction() {
  return useStore((s) => s.rejectAction);
}

/** Attach file for chat */
export function useAttachFileForChat() {
  return useStore((s) => s.attachFileForChat);
}

/** Import attached file */
export function useImportAttachedFile() {
  return useStore((s) => s.importAttachedFile);
}

/** Clear attached file */
export function useClearAttachedFile() {
  return useStore((s) => s.clearAttachedFile);
}

// ─── Clipboard ─────────────────────────────────────────────────────────────────

/** Copy */
export function useCopy() {
  return useStore((s) => s.copy);
}

/** Cut */
export function useCut() {
  return useStore((s) => s.cut);
}

/** Paste */
export function usePaste() {
  return useStore((s) => s.paste);
}

// ─── File Actions ──────────────────────────────────────────────────────────────

/** Create file */
export function useCreateFile() {
  return useStore((s) => s.createFile);
}

/** Create folder */
export function useCreateFolder() {
  return useStore((s) => s.createFolder);
}

/** Delete file */
export function useDeleteFile() {
  return useStore((s) => s.deleteFile);
}

/** Rename file */
export function useRenameFile() {
  return useStore((s) => s.renameFile);
}

/** Open file */
export function useOpenFile() {
  return useStore((s) => s.openFile);
}

// ─── Context Menu ──────────────────────────────────────────────────────────────

/** Set context menu */
export function useSetContextMenu() {
  return useStore((s) => s.setContextMenu);
}

// ─── UI State ──────────────────────────────────────────────────────────────────

/** Toggle chat */
export function useToggleChat() {
  return useStore((s) => s.toggleChat);
}

/** Set show chat */
export function useSetShowChat() {
  return useStore((s) => s.setShowChat);
}

/** Set chat width */
export function useSetChatWidth() {
  return useStore((s) => s.setChatWidth);
}

/** Toggle file explorer */
export function useToggleFileExplorer() {
  return useStore((s) => s.toggleFileExplorer);
}

/** Toggle skills */
export function useToggleSkills() {
  return useStore((s) => s.toggleSkills);
}

/** Set show chart dialog */
export function useSetShowChartDialog() {
  return useStore((s) => s.setShowChartDialog);
}

/** Set show format panel */
export function useSetShowFormatPanel() {
  return useStore((s) => s.setShowFormatPanel);
}

/** Set show toolbar */
export function useSetShowToolbar() {
  return useStore((s) => s.setShowToolbar);
}

/** Toggle toolbar */
export function useToggleToolbar() {
  return useStore((s) => s.toggleToolbar);
}

/** Set show version history */
export function useSetShowVersionHistory() {
  return useStore((s) => s.setShowVersionHistory);
}

/** Set show validation dialog */
export function useSetShowValidationDialog() {
  return useStore((s) => s.setShowValidationDialog);
}

/** Set show pivot dialog */
export function useSetShowPivotDialog() {
  return useStore((s) => s.setShowPivotDialog);
}

/** Set active panel */
export function useSetActivePanel() {
  return useStore((s) => s.setActivePanel);
}

/** Get active panel */
export function useActivePanel() {
  return useStore((s) => s.activePanel);
}

// ─── Toast/Confirm ─────────────────────────────────────────────────────────────

/** Show toast */
export function useShowToast() {
  return useStore((s) => s.showToast);
}

/** Dismiss toast */
export function useDismissToast() {
  return useStore((s) => s.dismissToast);
}

/** Show confirm dialog */
export function useShowConfirm() {
  return useStore((s) => s.showConfirm);
}

/** Dismiss confirm */
export function useDismissConfirm() {
  return useStore((s) => s.dismissConfirm);
}

// ─── Engine Access ─────────────────────────────────────────────────────────────

/** Get the spreadsheet engine */
export function useEngine() {
  return useStore((s) => s.engine);
}

/** Get computed value for arbitrary cell (alias for useComputedValue) */
export function useGetComputedValue() {
  return useStore((s) => s.getComputedValue);
}
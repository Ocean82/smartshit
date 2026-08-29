/**
 * MobileMenu — Bottom sheet menu for mobile devices.
 * Replaces the desktop MenuBar dropdown pattern with touch-friendly actions.
 */
import React, { useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/store/useStore';
import { exportWorkbookToXlsx, exportSheetToCsv, importWorkbookFromFileWithMeta } from '@/io/xlsx';
import { workbookHasContent } from '@/lib/workbookGuard';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { v4 as uuid } from 'uuid';
import {
  Menu, X, FileText, FolderOpen, Download,
  Undo2, Redo2, Scissors, Copy, ClipboardPaste,
  BarChart3, Table, Filter, SortAsc, SortDesc,
  Maximize, LayoutTemplate, Cloud, Share2,
  MessageSquare, ShieldCheck, Microscope, Search, Shield, Paintbrush, Replace,
} from 'lucide-react';

interface MobileMenuProps {
  onOpenTemplates: () => void
  onOpenCloudPicker: () => void
  onOpenShare: () => void
  onOpenCommandPalette: () => void
}

export function MobileMenu({ onOpenTemplates, onOpenCloudPicker, onOpenShare, onOpenCommandPalette }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useFocusTrap<HTMLDivElement>(isOpen, () => setIsOpen(false));
  const {
    workbook,
    undo,
    redo,
    undoStack,
    redoStack,
    copy,
    cut,
    paste,
    selection,
    pushHistory,
    toggleFileExplorer,
    getActiveSheet,
    setShowChartDialog,
    setShowFilterDialog,
    setShowPivotDialog,
    setShowValidationDialog,
    setShowConditionalFormatDialog,
    setShowFindReplace,
    setShowFormatPanel,
    setActivePanel,
    sortByColumn,
    initWorkbook,
    addMessage,
    showVersionHistory,
    setShowVersionHistory,
    showConfirm,
  } = useStore(useShallow((s) => ({
    workbook: s.workbook,
    undo: s.undo,
    redo: s.redo,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
    copy: s.copy,
    cut: s.cut,
    paste: s.paste,
    selection: s.selection,
    pushHistory: s.pushHistory,
    toggleFileExplorer: s.toggleFileExplorer,
    getActiveSheet: s.getActiveSheet,
    setShowChartDialog: s.setShowChartDialog,
    setShowFilterDialog: s.setShowFilterDialog,
    setShowPivotDialog: s.setShowPivotDialog,
    setShowValidationDialog: s.setShowValidationDialog,
    setShowConditionalFormatDialog: s.setShowConditionalFormatDialog,
    setShowFindReplace: s.setShowFindReplace,
    setShowFormatPanel: s.setShowFormatPanel,
    setActivePanel: s.setActivePanel,
    sortByColumn: s.sortByColumn,
    initWorkbook: s.initWorkbook,
    addMessage: s.addMessage,
    showVersionHistory: s.showVersionHistory,
    setShowVersionHistory: s.setShowVersionHistory,
    showConfirm: s.showConfirm,
  })));

  const sheet = getActiveSheet();
  const col = selection ? Math.min(selection.startCol, selection.endCol) : 0;

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pushHistory('Open file');
      const { workbook: wb } = await importWorkbookFromFileWithMeta(file);
      useStore.getState().importWorkbook(wb, { fileName: file.name });
    } catch {
      addMessage({ id: uuid(), role: 'assistant', content: `Could not open **${file.name}**.`, timestamp: Date.now() });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsOpen(false);
  };

  const handleNewWorkbook = () => {
    if (Object.keys(getActiveSheet().cells).length > 0) {
      showConfirm({
        title: 'New workbook',
        message: 'This will replace the current workbook with a new, blank workbook. Undo history will be cleared.',
        confirmLabel: 'Create new',
        variant: 'warning',
        onConfirm: () => {
          initWorkbook('New Workbook');
          setIsOpen(false);
        },
      });
    } else {
      initWorkbook('New Workbook');
      setIsOpen(false);
    }
  };

  const actions = [
    { section: 'File' },
    { label: 'New Workbook', icon: <FileText size={18} />, action: handleNewWorkbook },
    { label: 'Open File...', icon: <FolderOpen size={18} />, action: () => {
      const proceed = () => fileInputRef.current?.click()
      if (workbookHasContent(useStore.getState().workbook)) {
        showConfirm({
          title: 'Open file',
          message: 'Opening a file will replace the current workbook and clear undo history. This cannot be undone.',
          confirmLabel: 'Open file',
          variant: 'warning',
          onConfirm: proceed,
        })
      } else {
        proceed()
      }
    } },
    { label: 'Templates', icon: <LayoutTemplate size={18} />, action: () => { setIsOpen(false); onOpenTemplates(); } },
    { label: 'Cloud workbooks', icon: <Cloud size={18} />, action: () => { setIsOpen(false); onOpenCloudPicker(); } },
    { label: 'Share', icon: <Share2 size={18} />, action: () => { setIsOpen(false); onOpenShare(); } },
    { label: 'Save as Excel', icon: <Download size={18} />, action: () => { exportWorkbookToXlsx(workbook); setIsOpen(false); } },
    { label: 'Save as CSV', icon: <Download size={18} />, action: () => { exportSheetToCsv(sheet, workbook.name); setIsOpen(false); } },
    { label: 'Version History', icon: <FileText size={18} />, action: () => { setShowVersionHistory(!showVersionHistory); setIsOpen(false); } },
    { section: 'Edit' },
    { label: 'Undo', icon: <Undo2 size={18} />, action: () => { undo(); setIsOpen(false); }, disabled: undoStack.length === 0 },
    { label: 'Redo', icon: <Redo2 size={18} />, action: () => { redo(); setIsOpen(false); }, disabled: redoStack.length === 0 },
    { label: 'Cut', icon: <Scissors size={18} />, action: () => { cut(); setIsOpen(false); } },
    { label: 'Copy', icon: <Copy size={18} />, action: () => { copy(); setIsOpen(false); } },
    { label: 'Paste', icon: <ClipboardPaste size={18} />, action: () => { paste(); setIsOpen(false); } },
    { section: 'Data' },
    { label: 'Sort Ascending', icon: <SortAsc size={18} />, action: () => { if (selection) sortByColumn(col, 'asc'); setIsOpen(false); }, disabled: !selection },
    { label: 'Sort Descending', icon: <SortDesc size={18} />, action: () => { if (selection) sortByColumn(col, 'desc'); setIsOpen(false); }, disabled: !selection },
    { label: 'Filter...', icon: <Filter size={18} />, action: () => { setShowFilterDialog(true); setIsOpen(false); } },
    { label: 'Find & Replace', icon: <Replace size={18} />, action: () => { setShowFindReplace(true); setIsOpen(false); } },
    { label: 'Data Validation', icon: <Shield size={18} />, action: () => { setShowValidationDialog(true); setIsOpen(false); } },
    { label: 'Conditional Format', icon: <Paintbrush size={18} />, action: () => { setShowConditionalFormatDialog(true); setIsOpen(false); } },
    { label: 'Format panel', icon: <Paintbrush size={18} />, action: () => { setShowFormatPanel(true); setIsOpen(false); } },
    { label: 'Insert Chart', icon: <BarChart3 size={18} />, action: () => { setShowChartDialog(true); setIsOpen(false); } },
    { label: 'Pivot Table', icon: <Table size={18} />, action: () => { setShowPivotDialog(true); setIsOpen(false); }, disabled: !selection },
    { section: 'View' },
    { label: 'Chat', icon: <MessageSquare size={18} />, action: () => { setActivePanel('chat'); setIsOpen(false); } },
    { label: 'Insights', icon: <BarChart3 size={18} />, action: () => { setActivePanel('insights'); setIsOpen(false); } },
    { label: 'Auditor', icon: <ShieldCheck size={18} />, action: () => { setActivePanel('auditor'); setIsOpen(false); } },
    { label: 'Inspector', icon: <Microscope size={18} />, action: () => { setActivePanel('inspector'); setIsOpen(false); } },
    { label: 'Command palette', icon: <Search size={18} />, action: () => { setIsOpen(false); onOpenCommandPalette(); } },
    { label: 'Files', icon: <FolderOpen size={18} />, action: () => { toggleFileExplorer(); setIsOpen(false); } },
    { label: 'Full Screen', icon: <Maximize size={18} />, action: () => { document.documentElement.requestFullscreen?.(); setIsOpen(false); } },
  ];

  return (
    <>
      {/* Hamburger button in title bar */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Overlay + Bottom Sheet */}
      {isOpen && (
        <div ref={sheetRef} className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[80vh] overflow-y-auto motion-safe:animate-slide-up safe-area-bottom" style={{ background: 'var(--surface-panel)' }}>
            {/* Handle */}
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--neutral-300)' }} />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b" style={{ borderColor: 'var(--neutral-100)' }}>
              <h2 data-focus-on-open tabIndex={-1} className="text-base font-semibold" style={{ color: 'var(--ink-primary)' }}>Menu</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--neutral-400)' }}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            {/* Actions */}
            <div className="py-2">
              {actions.map((item, i) => {
                if ('section' in item && item.section) {
                  return (
                    <div key={i} className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                      {item.section}
                    </div>
                  );
                }
                const { label, icon, action, disabled } = item as { label: string; icon: React.ReactNode; action: () => void; disabled?: boolean };
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={action}
                    disabled={disabled}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                      disabled ? 'opacity-30 pointer-events-none' : ''
                    }`}
                    style={{ color: 'var(--ink-primary)' }}
                  >
                    <span style={{ color: 'var(--neutral-400)' }}>{icon}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleImportFile}
      />
    </>
  );
}

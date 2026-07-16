/**
 * MobileMenu — Bottom sheet menu for mobile devices.
 * Replaces the desktop MenuBar dropdown pattern with touch-friendly actions.
 */
import { useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { exportWorkbookToXlsx, exportSheetToCsv, importWorkbookFromFileWithMeta } from '@/io/xlsx';
import { v4 as uuid } from 'uuid';
import {
  Menu, X, FileText, FolderOpen, Download,
  Undo2, Redo2, Scissors, Copy, ClipboardPaste,
  BarChart3, Table, Filter, SortAsc, SortDesc,
  Maximize,
} from 'lucide-react';

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    sortByColumn,
    activeSortConfig,
    initWorkbook,
    addMessage,
    showVersionHistory,
    setShowVersionHistory,
  } = useStore();

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
      if (!confirm('Create a new workbook? Unsaved changes will be lost.')) return;
    }
    initWorkbook('New Workbook');
    setIsOpen(false);
  };

  const actions = [
    { section: 'File' },
    { label: 'New Workbook', icon: <FileText size={18} />, action: handleNewWorkbook },
    { label: 'Open File...', icon: <FolderOpen size={18} />, action: () => { fileInputRef.current?.click(); } },
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
    { label: 'Insert Chart', icon: <BarChart3 size={18} />, action: () => { setShowChartDialog(true); setIsOpen(false); } },
    { label: 'Pivot Table', icon: <Table size={18} />, action: () => { setShowPivotDialog(true); setIsOpen(false); }, disabled: !selection },
    { section: 'View' },
    { label: 'Files Sidebar', icon: <FolderOpen size={18} />, action: () => { toggleFileExplorer(); setIsOpen(false); } },
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
        <div className="fixed inset-0 z-[100] md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up safe-area-bottom">
            {/* Handle */}
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Menu</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
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
                    <div key={i} className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
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
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors active:bg-gray-50 ${
                      disabled ? 'opacity-30 pointer-events-none' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-gray-400">{icon}</span>
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

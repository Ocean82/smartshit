import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { importWorkbookFromFileWithMeta, exportWorkbookToXlsx, exportSheetToCsv } from '@/io/xlsx';
import { recordTelemetry } from '@/ai/telemetry';
import { isBankCSV, parseBankCSV } from '@/lib/bankImport';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Paintbrush, Type, Grid3x3, BarChart3,
  Download, Upload, Plus, FolderOpen, Sparkles,
  Filter, SortAsc, Scissors, Copy, ClipboardPaste,
} from 'lucide-react';
import { BG_COLORS, FULL_COLORS } from '@/data/colors';
import { useRef, useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { FormulaAutocomplete } from './FormulaAutocomplete';
import './Toolbar.css';

export function Toolbar() {
  const {
    selection,
    editingCell,
    editValue,
    setEditValue,
    setRangeFormat,
    undo,
    redo,
    undoStack,
    redoStack,
    toggleFileExplorer,
    toggleSkills,
    showFileExplorer,
    showSkills,
    setShowChartDialog,
    showPivotDialog,
    setShowPivotDialog,
    showFormatPanel,
    setShowFormatPanel,
    activeFilters,
    activeSortConfig,
    sortByColumn,
    setShowFilterDialog,
    setShowConditionalFormatDialog,
    copy,
    cut,
    paste,
    pushHistory,
    getActiveSheet,
    getComputedValue,
    setCellValue,
    setEditingCell,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const formulaBarRef = useRef<HTMLInputElement>(null);
  const fontColorRef = useRef<HTMLDivElement>(null);
  const [fbAutocompleteVisible, setFbAutocompleteVisible] = useState(false);
  const [fbAutocompletePos, setFbAutocompletePos] = useState({ top: 0, left: 0 });
  const [showFontColor, setShowFontColor] = useState(false);
  const sheet = getActiveSheet();

  useEffect(() => {
    if (!showFontColor) return;
    function handleClickOutside(e: MouseEvent) {
      if (fontColorRef.current && !fontColorRef.current.contains(e.target as Node)) {
        setShowFontColor(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFontColor]);

  const selectedCellId = selection ? refToCell(selection.startRow, selection.startCol) : '';
  const selectedCellData = selectedCellId ? sheet.cells[selectedCellId] : undefined;

  const handleFormulaBarChange = (val: string) => {
    setEditValue(val);
    if (selectedCellId && !editingCell) {
      setEditingCell(selectedCellId);
    }
  };

  const handleFormulaBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedCellId) {
        pushHistory('Edit ' + selectedCellId);
        if (editValue.startsWith('=')) {
          setCellValue(selectedCellId, null, editValue);
        } else {
          const num = Number(editValue);
          if (editValue !== '' && !isNaN(num)) {
            setCellValue(selectedCellId, num);
          } else {
            setCellValue(selectedCellId, editValue || null);
          }
        }
        setEditingCell(null);
        setEditValue('');
      }
    }
  };

  const displayFormulaValue = editingCell
    ? editValue
    : selectedCellData?.formula || (selectedCellData?.value != null ? String(selectedCellData.value) : '') || (selection ? getComputedValue(selection.startRow, selection.startCol) : '');

  const handleExportCSV = () => {
    exportSheetToCsv(sheet, sheet.name.replace(/\s+/g, '_'));
  };

  const handleExportXlsx = () => {
    const { workbook } = useStore.getState();
    exportWorkbookToXlsx(workbook);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

  // Also route CSV through SheetJS so multi-sheet-capable paths stay consistent
  if (file.name.match(/\.(xlsx?|csv)$/i)) {
      pushHistory('Import file');
      const { workbook, meta } = await importWorkbookFromFileWithMeta(file);
      useStore.getState().importWorkbook(workbook, { fileName: file.name });
      if (meta.warnings.length) {
        recordTelemetry('importTruncationEvents', `Toolbar import: ${file.name}`)
        useStore.getState().addMessage({
          id: uuid(),
          role: 'assistant',
          content: `Import note: ${meta.warnings.join(' ')}`,
          timestamp: Date.now(),
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    handleImportCSV(e);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Try bank CSV detection first
      if (isBankCSV(text)) {
        const result = parseBankCSV(text);
        if (result && result.transactions.length > 0) {
          pushHistory('Import Bank CSV');
          // Build a categorized spreadsheet from bank transactions
          const cells: Record<string, { value: string | number | boolean | null }> = {};
          // Header row
          cells[refToCell(0, 0)] = { value: '📊 Bank Statement Import' };
          cells[refToCell(1, 0)] = { value: `Source: ${result.bankName}` };
          cells[refToCell(1, 2)] = { value: `${result.dateRange.start} to ${result.dateRange.end}` };

          // Transaction headers
          cells[refToCell(3, 0)] = { value: 'Date' };
          cells[refToCell(3, 1)] = { value: 'Description' };
          cells[refToCell(3, 2)] = { value: 'Category' };
          cells[refToCell(3, 3)] = { value: 'Amount' };
          cells[refToCell(3, 4)] = { value: 'Type' };

          // Transaction data
          result.transactions.forEach((t, i) => {
            const row = 4 + i;
            cells[refToCell(row, 0)] = { value: t.date };
            cells[refToCell(row, 1)] = { value: t.description };
            cells[refToCell(row, 2)] = { value: t.category };
            cells[refToCell(row, 3)] = { value: t.type === 'debit' ? -t.amount : t.amount };
            cells[refToCell(row, 4)] = { value: t.type === 'credit' ? 'Income' : 'Expense' };
          });

          // Summary section
          const summaryRow = 4 + result.transactions.length + 2;
          cells[refToCell(summaryRow, 0)] = { value: '📈 Summary' };
          cells[refToCell(summaryRow + 1, 0)] = { value: 'Total Income' };
          cells[refToCell(summaryRow + 1, 1)] = { value: result.totalIncome };
          cells[refToCell(summaryRow + 2, 0)] = { value: 'Total Expenses' };
          cells[refToCell(summaryRow + 2, 1)] = { value: -result.totalExpenses };
          cells[refToCell(summaryRow + 3, 0)] = { value: 'Net' };
          cells[refToCell(summaryRow + 3, 1)] = { value: result.totalIncome - result.totalExpenses };

          // Category breakdown
          const catRow = summaryRow + 5;
          cells[refToCell(catRow, 0)] = { value: '📋 Spending by Category' };
          cells[refToCell(catRow + 1, 0)] = { value: 'Category' };
          cells[refToCell(catRow + 1, 1)] = { value: 'Total' };
          cells[refToCell(catRow + 1, 2)] = { value: 'Transactions' };
          result.categoryBreakdown.forEach((cat, i) => {
            cells[refToCell(catRow + 2 + i, 0)] = { value: cat.category };
            cells[refToCell(catRow + 2 + i, 1)] = { value: -cat.total };
            cells[refToCell(catRow + 2 + i, 2)] = { value: cat.count };
          });

          useStore.getState().bulkSetCells(cells);

          // Format headers
          useStore.getState().setCellFormat(refToCell(0, 0), { bold: true, fontSize: 16, fontColor: '#1E40AF' });
          useStore.getState().setCellFormat(refToCell(3, 0), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 1), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 2), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 3), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 4), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });

          // Build summary message
          const topCats = result.categoryBreakdown.slice(0, 5).map((c) => `• **${c.category}**: $${c.total.toLocaleString()} (${c.count} transactions)`).join('\n');
          useStore.getState().addMessage({
            id: uuid(),
            role: 'assistant',
            content: `Imported **${file.name}** from **${result.bankName}** — ${result.transactions.length} transactions auto-categorized.\n\n**Income:** $${result.totalIncome.toLocaleString()}\n**Expenses:** $${result.totalExpenses.toLocaleString()}\n**Net:** $${(result.totalIncome - result.totalExpenses).toLocaleString()}\n\n**Top spending categories:**\n${topCats}\n\nTry: **"Where am I overspending?"** or **"How can I save more?"**`,
            timestamp: Date.now(),
          });

          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }
      }

      // Fallback: generic CSV import
      pushHistory('Import CSV');
      const rows = text.split('\n').filter(Boolean);
      const cells: Record<string, { value: string | number | boolean | null }> = {};
      rows.forEach((row, r) => {
        const values = row.split(',').map(v => v.replace(/^"|"$/g, '').trim());
        values.forEach((val, c) => {
          const cellId = refToCell(r, c);
          const num = Number(val);
          if (val !== '' && !isNaN(num)) {
            cells[cellId] = { value: num };
          } else {
            cells[cellId] = { value: val || null };
          }
        });
      });
      useStore.getState().bulkSetCells(cells);
      useStore.getState().addMessage({
        id: uuid(),
        role: 'assistant',
        content: `Imported **${file.name}** — ${rows.length} rows on the current sheet.\n\nAsk me to explain it, find overspending, or suggest savings.`,
        timestamp: Date.now(),
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const colorOptions = BG_COLORS;

  const fontColorOptions = FULL_COLORS;

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Top toolbar row */}
      <div className="flex items-center px-2 py-1 gap-1 border-b border-gray-100 overflow-x-auto">
        {/* Sidebar toggles */}
        <ToolButton
          icon={<FolderOpen size={15} />}
          title="Files"
          active={showFileExplorer}
          onClick={toggleFileExplorer}
        />
        <ToolButton
          icon={<Sparkles size={15} />}
          title="Skills"
          active={showSkills}
          onClick={toggleSkills}
        />
        <Divider />

        {/* Undo/Redo */}
        <ToolButton icon={<Undo2 size={15} />} title="Undo (Ctrl+Z)" onClick={undo} disabled={undoStack.length === 0} />
        <ToolButton icon={<Redo2 size={15} />} title="Redo (Ctrl+Y)" onClick={redo} disabled={redoStack.length === 0} />
        <Divider />

        {/* Clipboard */}
        <ToolButton icon={<Copy size={15} />} title="Copy (Ctrl+C)" onClick={copy} />
        <ToolButton icon={<Scissors size={15} />} title="Cut (Ctrl+X)" onClick={cut} />
        <ToolButton icon={<ClipboardPaste size={15} />} title="Paste (Ctrl+V)" onClick={paste} />
        <Divider />

        {/* Formatting */}
        <ToolButton
          icon={<Bold size={15} />}
          title="Bold (Ctrl+B)"
          active={selectedCellData?.format?.bold}
          onClick={() => setRangeFormat({ bold: !selectedCellData?.format?.bold })}
        />
        <ToolButton
          icon={<Italic size={15} />}
          title="Italic (Ctrl+I)"
          active={selectedCellData?.format?.italic}
          onClick={() => setRangeFormat({ italic: !selectedCellData?.format?.italic })}
        />
        <ToolButton
          icon={<Underline size={15} />}
          title="Underline"
          active={selectedCellData?.format?.underline}
          onClick={() => setRangeFormat({ underline: !selectedCellData?.format?.underline })}
        />
        <Divider />

        {/* Alignment */}
        <ToolButton
          icon={<AlignLeft size={15} />}
          title="Align Left"
          onClick={() => setRangeFormat({ textAlign: 'left' })}
        />
        <ToolButton
          icon={<AlignCenter size={15} />}
          title="Align Center"
          onClick={() => setRangeFormat({ textAlign: 'center' })}
        />
        <ToolButton
          icon={<AlignRight size={15} />}
          title="Align Right"
          onClick={() => setRangeFormat({ textAlign: 'right' })}
        />
        <Divider />

        {/* Font size */}
        <div className="relative">
          <Type size={13} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            className="pl-6 pr-1 py-1 text-xs bg-white border border-gray-200 rounded hover:border-gray-300 cursor-pointer appearance-none"
            value={selectedCellData?.format?.fontSize || 13}
            onChange={(e) => setRangeFormat({ fontSize: parseInt(e.target.value) })}
            title="Font size"
            aria-label="Font size"
          >
            {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Cell color */}
        <div className="relative group">
          <ToolButton icon={<Paintbrush size={15} />} title="Cell Color" onClick={() => {}} />
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-2 hidden group-hover:grid grid-cols-7 gap-1 z-50">
            {colorOptions.map((color, index) => (
              <button
                key={color}
                className={`w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform toolbar-color-${index}`}
                onClick={() => setRangeFormat({ bgColor: color })}
                aria-label={`Set cell color ${color}`}
                title={`Set cell color ${color}`}
              />
            ))}
          </div>
        </div>

        {/* Font color */}
        <div className="relative" ref={fontColorRef}>
          <button
            type="button"
            onClick={() => setShowFontColor(!showFontColor)}
            className="flex items-center gap-1 px-1.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Text color"
          >
            <span className="font-bold" style={{ color: selectedCellData?.format?.fontColor || '#000' }}>A</span>
            <div
              className="w-4 h-1 rounded-sm"
              style={{ backgroundColor: selectedCellData?.format?.fontColor || '#000' }}
            />
          </button>
          {showFontColor && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-7 gap-1">
              {fontColorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    setRangeFormat({ fontColor: c });
                    setShowFontColor(false);
                  }}
                  aria-label={`Set text color ${c}`}
                  title={`Set text color ${c}`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowFormatPanel(!showFormatPanel)}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
            showFormatPanel ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
          }`}
          title="Toggle format panel"
        >
          Format
        </button>
        <Divider />

        {/* Data tools */}
        <ToolButton
          icon={<Filter size={15} />}
          title="Filter"
          active={activeFilters.length > 0}
          onClick={() => setShowFilterDialog(true)}
        />
        <ToolButton
          icon={<SortAsc size={15} />}
          title="Sort by column"
          onClick={() => {
            if (!selection) return;
            const col = Math.min(selection.startCol, selection.endCol);
            const nextDir = activeSortConfig?.column === col && activeSortConfig.direction === 'asc' ? 'desc' : 'asc';
            sortByColumn(col, nextDir);
          }}
        />
        <ToolButton
          icon={<Grid3x3 size={15} />}
          title="Conditional Format"
          onClick={() => setShowConditionalFormatDialog(true)}
        />
        <ToolButton icon={<BarChart3 size={15} />} title="Insert Chart" onClick={() => setShowChartDialog(true)} />
        <Divider />

        {/* Pivot Table */}
        <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
          <button
            onClick={() => setShowPivotDialog(true)}
            disabled={!selection}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Create pivot table from selection"
          >
            <span className="text-sm">📊</span> Pivot
          </button>
        </div>

        {/* Import/Export */}
        <ToolButton
          icon={<Upload size={15} />}
          title="Import CSV / Excel"
          onClick={() => fileInputRef.current?.click()}
        />
        <ToolButton icon={<Download size={15} />} title="Export CSV" onClick={handleExportCSV} />
        <ToolButton icon={<Download size={15} />} title="Export Excel" onClick={handleExportXlsx} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          aria-label="Import spreadsheet file"
          title="Import spreadsheet file"
          onChange={handleImportFile}
        />

        <div className="flex-1" />
      </div>

      {/* Formula bar */}
      <div className="flex items-center px-2 py-1 gap-2">
        <div className="w-16 text-center text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-0.5">
          {selectedCellId || ''}
        </div>
        <div className="text-gray-400 text-sm font-mono">ƒx</div>
        <input
          ref={formulaBarRef}
          className="flex-1 text-sm px-2 py-0.5 border border-gray-200 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none font-mono"
          value={displayFormulaValue}
          onFocus={(e) => {
            if (e.currentTarget.value.startsWith('=')) {
              const rect = e.currentTarget.getBoundingClientRect();
              setFbAutocompletePos({ top: rect.bottom + 2, left: rect.left });
              setFbAutocompleteVisible(true);
            }
          }}
          onChange={(e) => {
            const val = e.target.value;
            handleFormulaBarChange(val);
            if (val.startsWith('=')) {
              const rect = formulaBarRef.current?.getBoundingClientRect();
              if (rect) setFbAutocompletePos({ top: rect.bottom + 2, left: rect.left });
              setFbAutocompleteVisible(true);
            } else {
              setFbAutocompleteVisible(false);
            }
          }}
          onBlur={() => setTimeout(() => setFbAutocompleteVisible(false), 200)}
          onKeyDown={handleFormulaBarKeyDown}
          placeholder="Enter a value or formula..."
        />
        <button
          onClick={() => {
            const store = useStore.getState();
            if (store.selection) {
              const cid = refToCell(store.selection.startRow, store.selection.startCol);
              store.pushHistory('Quick formula');
              store.setCellValue(cid, null, '=SUM(A1:A10)');
            }
          }}
          className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-gray-600"
          title="Insert SUM"
        >
          Σ
        </button>
      </div>
      <FormulaAutocomplete
        visible={fbAutocompleteVisible}
        editValue={displayFormulaValue}
        onSelect={(fn) => {
          if (fn) {
            const currentVal = displayFormulaValue;
            const newVal = currentVal.replace(/=[A-Za-z_]*$/, '=' + fn + '(');
            handleFormulaBarChange(newVal);
          }
          setFbAutocompleteVisible(false);
        }}
        position={fbAutocompletePos}
      />
    </div>
  );
}

function ToolButton({
  icon,
  title,
  onClick,
  active,
  disabled,
  className = '',
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`p-1.5 rounded transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

// Add Plus icon export for sheet tabs
export { Plus };

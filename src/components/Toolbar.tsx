import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { importWorkbookFromFileWithMeta, exportWorkbookToXlsx, exportSheetToCsv } from '@/io/xlsx';
import { recordTelemetry } from '@/ai/telemetry';
import { isBankCSV, parseBankCSV } from '@/lib/bankImport';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Paintbrush, Type, Grid3x3, BarChart3,
  Download, Upload, ChevronDown,
  Filter, SortAsc,
} from 'lucide-react';
import { BG_COLORS, FULL_COLORS } from '@/data/colors';
import { useRef, useState, useEffect, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import './Toolbar.css';

export function Toolbar() {
  const {
    selection,
    setRangeFormat,
    undo,
    redo,
    undoStack,
    redoStack,
    setShowChartDialog,
    setShowPivotDialog,
    showFormatPanel,
    setShowFormatPanel,
    activeFilters,
    activeSortConfig,
    sortByColumn,
    setShowFilterDialog,
    setShowConditionalFormatDialog,
    pushHistory,
    getActiveSheet,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontColorRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [showFontColor, setShowFontColor] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const sheet = getActiveSheet();

  // Close font color picker on outside click
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

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  const selectedCellId = selection ? refToCell(selection.startRow, selection.startCol) : '';
  const selectedCellData = selectedCellId ? sheet.cells[selectedCellId] : undefined;

  const handleExportCSV = useCallback(() => {
    exportSheetToCsv(sheet, sheet.name.replace(/\s+/g, '_'));
    setShowExportMenu(false);
  }, [sheet]);

  const handleExportXlsx = useCallback(() => {
    const { workbook } = useStore.getState();
    exportWorkbookToXlsx(workbook);
    setShowExportMenu(false);
  }, []);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Also route CSV through SheetJS so multi-sheet-capable paths stay consistent
    if (file.name.match(/\.(xlsx?|csv)$/i)) {
      pushHistory('Import file');
      const { workbook, meta } = await importWorkbookFromFileWithMeta(file);
      useStore.getState().importWorkbook(workbook, { fileName: file.name });
      if (meta.warnings.length) {
        recordTelemetry('importTruncationEvents', `Toolbar import: ${file.name}`);
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
          const cells: Record<string, { value: string | number | boolean | null }> = {};
          cells[refToCell(0, 0)] = { value: '📊 Bank Statement Import' };
          cells[refToCell(1, 0)] = { value: `Source: ${result.bankName}` };
          cells[refToCell(1, 2)] = { value: `${result.dateRange.start} to ${result.dateRange.end}` };

          cells[refToCell(3, 0)] = { value: 'Date' };
          cells[refToCell(3, 1)] = { value: 'Description' };
          cells[refToCell(3, 2)] = { value: 'Category' };
          cells[refToCell(3, 3)] = { value: 'Amount' };
          cells[refToCell(3, 4)] = { value: 'Type' };

          result.transactions.forEach((t, i) => {
            const row = 4 + i;
            cells[refToCell(row, 0)] = { value: t.date };
            cells[refToCell(row, 1)] = { value: t.description };
            cells[refToCell(row, 2)] = { value: t.category };
            cells[refToCell(row, 3)] = { value: t.type === 'debit' ? -t.amount : t.amount };
            cells[refToCell(row, 4)] = { value: t.type === 'credit' ? 'Income' : 'Expense' };
          });

          const summaryRow = 4 + result.transactions.length + 2;
          cells[refToCell(summaryRow, 0)] = { value: '📈 Summary' };
          cells[refToCell(summaryRow + 1, 0)] = { value: 'Total Income' };
          cells[refToCell(summaryRow + 1, 1)] = { value: result.totalIncome };
          cells[refToCell(summaryRow + 2, 0)] = { value: 'Total Expenses' };
          cells[refToCell(summaryRow + 2, 1)] = { value: -result.totalExpenses };
          cells[refToCell(summaryRow + 3, 0)] = { value: 'Net' };
          cells[refToCell(summaryRow + 3, 1)] = { value: result.totalIncome - result.totalExpenses };

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

          useStore.getState().setCellFormat(refToCell(0, 0), { bold: true, fontSize: 16, fontColor: '#1E40AF' });
          useStore.getState().setCellFormat(refToCell(3, 0), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 1), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 2), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 3), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });
          useStore.getState().setCellFormat(refToCell(3, 4), { bold: true, bgColor: '#1E40AF', fontColor: '#FFFFFF' });

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
    <div className="toolbar-root">
      <div className="toolbar-row">
        {/* ─── Primary: Undo / Redo ─── */}
        <div className="toolbar-group">
          <ToolButton icon={<Undo2 size={15} />} title="Undo (Ctrl+Z)" onClick={undo} disabled={undoStack.length === 0} />
          <ToolButton icon={<Redo2 size={15} />} title="Redo (Ctrl+Y)" onClick={redo} disabled={redoStack.length === 0} />
        </div>

        <Divider />

        {/* ─── Text formatting ─── */}
        <div className="toolbar-group">
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
            title="Underline (Ctrl+U)"
            active={selectedCellData?.format?.underline}
            onClick={() => setRangeFormat({ underline: !selectedCellData?.format?.underline })}
          />
        </div>

        <Divider />

        {/* ─── Font size (compact) ─── */}
        <div className="relative">
          <Type size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--neutral-400)' }} />
          <select
            className="toolbar-font-size"
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

        {/* ─── Alignment ─── */}
        <div className="toolbar-group">
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
        </div>

        <Divider />

        {/* ─── Color tools ─── */}
        <div className="toolbar-group">
          {/* Cell color */}
          <div className="relative group">
            <ToolButton icon={<Paintbrush size={15} />} title="Cell background color" onClick={() => {}} />
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
              className="toolbar-btn-color"
              title="Text color"
            >
              <span className="font-bold text-xs leading-none" style={{ color: selectedCellData?.format?.fontColor || 'var(--neutral-800)' }}>A</span>
              <div
                className="w-3.5 h-0.5 rounded-sm"
                style={{ backgroundColor: selectedCellData?.format?.fontColor || 'var(--neutral-800)' }}
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
        </div>

        <Divider />

        {/* ─── Data tools: filter & sort ─── */}
        <div className="toolbar-group">
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
        </div>

        <Divider />

        {/* ─── Insert: Chart + more ─── */}
        <div className="toolbar-group" ref={moreMenuRef}>
          <ToolButton icon={<BarChart3 size={15} />} title="Insert Chart" onClick={() => setShowChartDialog(true)} />
          <button
            type="button"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className={`toolbar-btn-more ${showMoreMenu ? 'active' : ''}`}
            title="More tools"
            aria-label="More tools"
            aria-expanded={showMoreMenu}
          >
            <ChevronDown size={13} />
          </button>

          {showMoreMenu && (
            <div className="toolbar-dropdown" role="menu">
              <button
                role="menuitem"
                className="toolbar-dropdown-item"
                onClick={() => { setShowConditionalFormatDialog(true); setShowMoreMenu(false); }}
              >
                <Grid3x3 size={14} />
                <span>Conditional Format</span>
              </button>
              <button
                role="menuitem"
                className="toolbar-dropdown-item"
                onClick={() => { setShowPivotDialog(true); setShowMoreMenu(false); }}
                disabled={!selection}
              >
                <BarChart3 size={14} />
                <span>Pivot Table</span>
              </button>
              <div className="toolbar-dropdown-divider" />
              <button
                role="menuitem"
                className="toolbar-dropdown-item"
                onClick={() => { setShowFormatPanel(!showFormatPanel); setShowMoreMenu(false); }}
              >
                <Paintbrush size={14} />
                <span>Format Panel</span>
              </button>
            </div>
          )}
        </div>

        {/* ─── Spacer ─── */}
        <div className="flex-1" />

        {/* ─── Import / Export (right-aligned) ─── */}
        <div className="toolbar-group">
          <ToolButton
            icon={<Upload size={15} />}
            title="Import file"
            onClick={() => fileInputRef.current?.click()}
          />

          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`toolbar-btn-export ${showExportMenu ? 'active' : ''}`}
              title="Export"
              aria-label="Export options"
              aria-expanded={showExportMenu}
            >
              <Download size={15} />
              <ChevronDown size={10} />
            </button>
            {showExportMenu && (
              <div className="toolbar-dropdown toolbar-dropdown-right" role="menu">
                <button role="menuitem" className="toolbar-dropdown-item" onClick={handleExportCSV}>
                  <span>Export as CSV</span>
                </button>
                <button role="menuitem" className="toolbar-dropdown-item" onClick={handleExportXlsx}>
                  <span>Export as Excel</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          aria-label="Import spreadsheet file"
          title="Import spreadsheet file"
          onChange={handleImportFile}
        />
      </div>
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
      className={`toolbar-btn ${active ? 'toolbar-btn-active' : ''} ${disabled ? 'toolbar-btn-disabled' : ''} ${className}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="toolbar-divider" />;
}

// Keep Plus icon export for sheet tabs
import { Plus } from 'lucide-react';
export { Plus };

import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { importWorkbookFromFileWithMeta, exportWorkbookToXlsx, exportSheetToCsv } from '@/io/xlsx';
import { recordTelemetry } from '@/ai/telemetry';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Paintbrush, Type, Grid3x3, BarChart3,
  Download, Upload, Plus, FolderOpen, Sparkles,
  Filter, SortAsc, Scissors, Copy, ClipboardPaste,
} from 'lucide-react';
import { useRef } from 'react';
import { v4 as uuid } from 'uuid';
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
  const sheet = getActiveSheet();

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

    if (file.name.match(/\.xlsx?$/i)) {
      pushHistory('Import Excel');
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
      pushHistory('Import CSV');
      const rows = text.split('\n').filter(Boolean);
      const cells: Record<string, { value: string | number | boolean | null }> = {};
      rows.forEach((row, r) => {
        // Simple CSV parser
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

  const colorOptions = [
    '#FFFFFF', '#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#EDE9FE',
    '#FCE7F3', '#F3F4F6', '#FCA5A5', '#FCD34D', '#6EE7B7', '#93C5FD',
    '#C4B5FD', '#F9A8D4',
  ];

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
        <Divider />

        {/* Data tools */}
        <ToolButton icon={<Filter size={15} />} title="Filter" onClick={() => {}} />
        <ToolButton icon={<SortAsc size={15} />} title="Sort" onClick={() => {}} />
        <ToolButton icon={<Grid3x3 size={15} />} title="Conditional Format" onClick={() => {}} />
        <ToolButton icon={<BarChart3 size={15} />} title="Insert Chart" onClick={() => setShowChartDialog(true)} />
        <Divider />

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
          className="flex-1 text-sm px-2 py-0.5 border border-gray-200 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none font-mono"
          value={displayFormulaValue}
          onChange={(e) => handleFormulaBarChange(e.target.value)}
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

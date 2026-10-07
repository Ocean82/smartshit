import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { exportWorkbookToXlsx, exportSheetToCsv } from '@/io/xlsx';
import { useWorkbookFileImport } from '@/hooks/useWorkbookFileImport';
import {
  Bold, Italic, Underline, Strikethrough, WrapText,
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Undo2, Redo2, Paintbrush, Type, Grid3x3, BarChart3,
  Download, Upload, ChevronDown, Sigma,
  Filter, SortAsc,
} from 'lucide-react';
import { BG_COLORS, FULL_COLORS } from '@/data/colors';
import { useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { AnchoredPanel } from '@/components/AnchoredPanel';
import './Toolbar.css';

const FONT_FAMILIES = ['System', 'Arial', 'Calibri', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Comic Sans MS'];

export function Toolbar() {
  const {
    selection,
    setRangeFormat,
    undo,
    redo,
    undoStack,
    redoStack,
    setShowChartDialog,
    showFormatPanel,
    setShowFormatPanel,
    activeFilters,
    activeSortConfig,
    sortByColumn,
    setShowFilterDialog,
    setShowConditionalFormatDialog,
    getActiveSheet,
    applyAutoAggregate,
  } = useStore(useShallow((s) => ({
    selection: s.selection,
    setRangeFormat: s.setRangeFormat,
    undo: s.undo,
    redo: s.redo,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
    setShowChartDialog: s.setShowChartDialog,
    showFormatPanel: s.showFormatPanel,
    setShowFormatPanel: s.setShowFormatPanel,
    activeFilters: s.activeFilters,
    activeSortConfig: s.activeSortConfig,
    sortByColumn: s.sortByColumn,
    setShowFilterDialog: s.setShowFilterDialog,
    setShowConditionalFormatDialog: s.setShowConditionalFormatDialog,
    getActiveSheet: s.getActiveSheet,
    applyAutoAggregate: s.applyAutoAggregate,
  })));

  const { requestImport, fileInput } = useWorkbookFileImport({ verb: 'Import', onDone: nudgeAuditorOnce });

  const cellColorRef = useRef<HTMLButtonElement>(null);
  const fontColorRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const autoSumBtnRef = useRef<HTMLButtonElement>(null);
  const [showCellColor, setShowCellColor] = useState(false);
  const [showFontColor, setShowFontColor] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAutoSum, setShowAutoSum] = useState(false);
  const sheet = getActiveSheet();

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
          <ToolButton
            icon={<Strikethrough size={15} />}
            title="Strikethrough (Ctrl+5)"
            active={selectedCellData?.format?.strikethrough}
            onClick={() => setRangeFormat({ strikethrough: !selectedCellData?.format?.strikethrough })}
          />
          <ToolButton
            icon={<WrapText size={15} />}
            title="Wrap text"
            active={selectedCellData?.format?.textWrap}
            onClick={() => setRangeFormat({ textWrap: !selectedCellData?.format?.textWrap })}
          />
        </div>

        <Divider />

        {/* ─── Font family + size (compact) ─── */}
        <div className="relative">
          <Type size={12} className="absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--neutral-400)' }} />
          <select
            className="toolbar-font-size"
            value={selectedCellData?.format?.fontFamily || 'System'}
            onChange={(e) => setRangeFormat({ fontFamily: e.target.value === 'System' ? '' : e.target.value })}
            title="Font family"
            aria-label="Font family"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

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

        {/* ─── Vertical alignment ─── */}
        <div className="toolbar-group">
          <ToolButton
            icon={<AlignVerticalJustifyStart size={15} />}
            title="Align Top"
            active={selectedCellData?.format?.verticalAlign === 'top'}
            onClick={() => setRangeFormat({ verticalAlign: selectedCellData?.format?.verticalAlign === 'top' ? undefined : 'top' })}
          />
          <ToolButton
            icon={<AlignVerticalJustifyCenter size={15} />}
            title="Align Middle"
            active={selectedCellData?.format?.verticalAlign === 'middle'}
            onClick={() => setRangeFormat({ verticalAlign: selectedCellData?.format?.verticalAlign === 'middle' ? undefined : 'middle' })}
          />
          <ToolButton
            icon={<AlignVerticalJustifyEnd size={15} />}
            title="Align Bottom"
            active={selectedCellData?.format?.verticalAlign === 'bottom'}
            onClick={() => setRangeFormat({ verticalAlign: selectedCellData?.format?.verticalAlign === 'bottom' ? undefined : 'bottom' })}
          />
        </div>

        <Divider />

        {/* ─── Number formats + AutoSum ─── */}
        <div className="toolbar-group">
          <ToolButton
            icon={<span className="text-[13px] font-semibold leading-none">%</span>}
            title="Percent"
            active={selectedCellData?.format?.numberFormat === 'percent'}
            onClick={() => setRangeFormat({ numberFormat: 'percent' })}
            disabled={!selection}
          />
          <ToolButton
            icon={<span className="text-[13px] font-semibold leading-none">$</span>}
            title="Currency"
            active={selectedCellData?.format?.numberFormat === 'currency'}
            onClick={() => setRangeFormat({ numberFormat: 'currency' })}
            disabled={!selection}
          />
          <ToolButton
            icon={<span className="text-[13px] font-semibold leading-none">,</span>}
            title="Comma number format"
            active={selectedCellData?.format?.numberFormat === 'number'}
            onClick={() => setRangeFormat({ numberFormat: 'number' })}
            disabled={!selection}
          />
          <button
            ref={autoSumBtnRef}
            type="button"
            className={`toolbar-btn ${showAutoSum ? 'toolbar-btn-active' : ''}`}
            title="AutoSum"
            aria-label="AutoSum"
            aria-expanded={showAutoSum}
            disabled={!selection}
            onClick={() => {
              setShowCellColor(false);
              setShowFontColor(false);
              setShowExportMenu(false);
              setShowMoreMenu(false);
              setShowAutoSum((v) => !v);
            }}
          >
            <Sigma size={15} />
            <ChevronDown size={10} />
          </button>
          <AnchoredPanel
            open={showAutoSum}
            onClose={() => setShowAutoSum(false)}
            anchorRef={autoSumBtnRef}
            width={140}
            maxHeight={220}
            aria-label="AutoSum functions"
            className="bg-white rounded-lg shadow-xl border border-gray-200 py-1"
          >
            {([
              ['SUM', 'Sum'],
              ['AVERAGE', 'Average'],
              ['COUNT', 'Count'],
              ['MAX', 'Max'],
              ['MIN', 'Min'],
            ] as const).map(([fn, label]) => (
              <button
                key={fn}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100"
                onClick={() => {
                  applyAutoAggregate(fn);
                  setShowAutoSum(false);
                }}
              >
                {label}
              </button>
            ))}
          </AnchoredPanel>
        </div>

        <Divider />

        {/* ─── Color tools ─── */}
        <div className="toolbar-group">
          <button
            ref={cellColorRef}
            type="button"
            className={`toolbar-btn ${showCellColor ? 'toolbar-btn-active' : ''}`}
            title="Cell background color"
            aria-label="Cell background color"
            aria-expanded={showCellColor}
            onClick={() => {
              setShowFontColor(false);
              setShowExportMenu(false);
              setShowMoreMenu(false);
              setShowAutoSum(false);
              setShowCellColor((v) => !v);
            }}
          >
            <Paintbrush size={15} />
          </button>
          <AnchoredPanel
            open={showCellColor}
            onClose={() => setShowCellColor(false)}
            anchorRef={cellColorRef}
            width={168}
            maxHeight={160}
            aria-label="Cell background colors"
            className="bg-white rounded-lg shadow-xl border border-gray-200 p-2"
          >
            <div className="grid grid-cols-7 gap-1">
              {colorOptions.map((color, index) => (
                <button
                  key={color}
                  type="button"
                  className={`w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform toolbar-color-${index}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setRangeFormat({ bgColor: color });
                    setShowCellColor(false);
                  }}
                  aria-label={`Set cell color ${color}`}
                  title={`Set cell color ${color}`}
                />
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
              Custom
              <input
                type="color"
                value={selectedCellData?.format?.bgColor && /^#[0-9A-Fa-f]{6}$/.test(selectedCellData.format.bgColor)
                  ? selectedCellData.format.bgColor
                  : '#FFFFFF'}
                onChange={(e) => {
                  setRangeFormat({ bgColor: e.target.value });
                  setShowCellColor(false);
                }}
                className="w-7 h-6 rounded border border-gray-200 cursor-pointer"
                aria-label="Custom cell background color"
              />
            </label>
          </AnchoredPanel>

          <button
            ref={fontColorRef}
            type="button"
            onClick={() => {
              setShowCellColor(false);
              setShowExportMenu(false);
              setShowMoreMenu(false);
              setShowAutoSum(false);
              setShowFontColor((v) => !v);
            }}
            className="toolbar-btn-color"
            title="Text color"
            aria-label="Text color"
            aria-expanded={showFontColor}
          >
            <span className="font-bold text-xs leading-none" style={{ color: selectedCellData?.format?.fontColor || 'var(--neutral-800)' }}>A</span>
            <div
              className="w-3.5 h-0.5 rounded-sm"
              style={{ backgroundColor: selectedCellData?.format?.fontColor || 'var(--neutral-800)' }}
            />
          </button>
          <AnchoredPanel
            open={showFontColor}
            onClose={() => setShowFontColor(false)}
            anchorRef={fontColorRef}
            width={168}
            maxHeight={160}
            aria-label="Text colors"
            className="bg-white border border-gray-200 rounded-lg shadow-lg p-2"
          >
            <div className="grid grid-cols-7 gap-1">
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
            <label className="mt-2 flex items-center gap-2 text-[10px] text-gray-500">
              Custom
              <input
                type="color"
                value={selectedCellData?.format?.fontColor && /^#[0-9A-Fa-f]{6}$/.test(selectedCellData.format.fontColor)
                  ? selectedCellData.format.fontColor
                  : '#000000'}
                onChange={(e) => {
                  setRangeFormat({ fontColor: e.target.value });
                  setShowFontColor(false);
                }}
                className="w-7 h-6 rounded border border-gray-200 cursor-pointer"
                aria-label="Custom text color"
              />
            </label>
          </AnchoredPanel>
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
        <div className="toolbar-group">
          <ToolButton icon={<BarChart3 size={15} />} title="Insert Chart" onClick={() => setShowChartDialog(true)} />
          <button
            ref={moreBtnRef}
            type="button"
            onClick={() => {
              setShowCellColor(false);
              setShowFontColor(false);
              setShowExportMenu(false);
              setShowAutoSum(false);
              setShowMoreMenu((v) => !v);
            }}
            className={`toolbar-btn-more ${showMoreMenu ? 'active' : ''}`}
            title="More tools"
            aria-label="More tools"
            aria-expanded={showMoreMenu}
          >
            <ChevronDown size={13} />
          </button>
          <AnchoredPanel
            open={showMoreMenu}
            onClose={() => setShowMoreMenu(false)}
            anchorRef={moreBtnRef}
            width={200}
            maxHeight={220}
            aria-label="More tools"
            className="toolbar-dropdown"
          >
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => { setShowConditionalFormatDialog(true); setShowMoreMenu(false); }}
            >
              <Grid3x3 size={14} />
              <span>Conditional Format</span>
            </button>
            <div className="toolbar-dropdown-divider" />
            <button
              type="button"
              className="toolbar-dropdown-item"
              onClick={() => { setShowFormatPanel(!showFormatPanel); setShowMoreMenu(false); }}
            >
              <Paintbrush size={14} />
              <span>Format Panel</span>
            </button>
          </AnchoredPanel>
        </div>

        {/* ─── Spacer ─── */}
        <div className="flex-1" />

        {/* ─── Import / Export (right-aligned) ─── */}
        <div className="toolbar-group">
          <ToolButton
            icon={<Upload size={15} />}
            title="Import file"
            onClick={requestImport}
          />

          <button
            ref={exportBtnRef}
            type="button"
            onClick={() => {
              setShowCellColor(false);
              setShowFontColor(false);
              setShowMoreMenu(false);
              setShowAutoSum(false);
              setShowExportMenu((v) => !v);
            }}
            className={`toolbar-btn-export ${showExportMenu ? 'active' : ''}`}
            title="Export"
            aria-label="Export options"
            aria-expanded={showExportMenu}
          >
            <Download size={15} />
            <ChevronDown size={10} />
          </button>
          <AnchoredPanel
            open={showExportMenu}
            onClose={() => setShowExportMenu(false)}
            anchorRef={exportBtnRef}
            width={180}
            maxHeight={140}
            align="end"
            aria-label="Export options"
            className="toolbar-dropdown"
          >
            <button type="button" className="toolbar-dropdown-item" onClick={handleExportCSV}>
              <span>Export as CSV</span>
            </button>
            <button type="button" className="toolbar-dropdown-item" onClick={handleExportXlsx}>
              <span>Export as Excel</span>
            </button>
          </AnchoredPanel>
        </div>

        {fileInput}
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
  icon: ReactNode;
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

/** After the first successful import, point the user at the auditor. */
function nudgeAuditorOnce(imported: boolean) {
  if (!imported || localStorage.getItem('smartsht-auditor-nudge-seen')) return;
  localStorage.setItem('smartsht-auditor-nudge-seen', '1');
  useStore.getState().showToast({
    type: 'info',
    message: 'Imported! Open the Auditor panel (right side) to check for formula errors.',
    duration: 6000,
  });
}

// Keep Plus icon export for sheet tabs
import { Plus } from 'lucide-react';
export { Plus };

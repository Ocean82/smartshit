/**
 * MobileToolbar — A compact, touch-friendly toolbar for mobile screens.
 * Shows only essential actions in a fixed bottom bar with proper touch targets.
 * Reveals additional tools via expandable tray.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Type, BarChart3, ChevronUp, ChevronDown,
  Filter, Paintbrush, X,
} from 'lucide-react';
import { BG_COLORS } from '@/data/colors';

type ToolGroup = 'format' | 'align' | 'color' | null;

export function MobileToolbar() {
  const {
    selection,
    setRangeFormat,
    undo,
    redo,
    undoStack,
    redoStack,
    getActiveSheet,
    setShowChartDialog,
    setShowFilterDialog,
    activeFilters,
  } = useStore();

  const [expandedGroup, setExpandedGroup] = useState<ToolGroup>(null);
  const sheet = getActiveSheet();
  const selectedCellId = selection ? refToCell(selection.startRow, selection.startCol) : '';
  const selectedCellData = selectedCellId ? sheet.cells[selectedCellId] : undefined;

  const toggleGroup = (group: ToolGroup) => {
    setExpandedGroup(expandedGroup === group ? null : group);
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 safe-area-bottom">
      {/* Expanded tray */}
      {expandedGroup && (
        <div className="border-b border-gray-100 px-3 py-2 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {expandedGroup === 'format' && (
            <>
              <MobileToolBtn
                icon={<Bold size={18} />}
                active={selectedCellData?.format?.bold}
                onClick={() => setRangeFormat({ bold: !selectedCellData?.format?.bold })}
                label="Bold"
              />
              <MobileToolBtn
                icon={<Italic size={18} />}
                active={selectedCellData?.format?.italic}
                onClick={() => setRangeFormat({ italic: !selectedCellData?.format?.italic })}
                label="Italic"
              />
              <MobileToolBtn
                icon={<Underline size={18} />}
                active={selectedCellData?.format?.underline}
                onClick={() => setRangeFormat({ underline: !selectedCellData?.format?.underline })}
                label="Underline"
              />
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <select
                className="h-9 px-2 text-sm bg-gray-50 border border-gray-200 rounded-lg"
                value={selectedCellData?.format?.fontSize || 13}
                onChange={(e) => setRangeFormat({ fontSize: parseInt(e.target.value) })}
                aria-label="Font size"
              >
                {[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map(s => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </>
          )}
          {expandedGroup === 'align' && (
            <>
              <MobileToolBtn
                icon={<AlignLeft size={18} />}
                onClick={() => setRangeFormat({ textAlign: 'left' })}
                label="Left"
              />
              <MobileToolBtn
                icon={<AlignCenter size={18} />}
                onClick={() => setRangeFormat({ textAlign: 'center' })}
                label="Center"
              />
              <MobileToolBtn
                icon={<AlignRight size={18} />}
                onClick={() => setRangeFormat({ textAlign: 'right' })}
                label="Right"
              />
            </>
          )}
          {expandedGroup === 'color' && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
              {BG_COLORS.map((color) => (
                <button
                  key={color}
                  className="w-8 h-8 rounded-lg border border-gray-200 shrink-0 active:scale-90 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => setRangeFormat({ bgColor: color })}
                  aria-label={`Set background color ${color}`}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpandedGroup(null)}
            className="ml-auto p-2 text-gray-400 hover:text-gray-600"
            aria-label="Close toolbar tray"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main action row */}
      <div className="flex items-center justify-around px-2 py-1.5">
        <MobileToolBtn
          icon={<Undo2 size={20} />}
          onClick={undo}
          disabled={undoStack.length === 0}
          label="Undo"
        />
        <MobileToolBtn
          icon={<Redo2 size={20} />}
          onClick={redo}
          disabled={redoStack.length === 0}
          label="Redo"
        />

        <div className="w-px h-6 bg-gray-200" />

        <MobileToolBtn
          icon={<Type size={20} />}
          onClick={() => toggleGroup('format')}
          active={expandedGroup === 'format'}
          label="Format"
        />
        <MobileToolBtn
          icon={<AlignCenter size={20} />}
          onClick={() => toggleGroup('align')}
          active={expandedGroup === 'align'}
          label="Align"
        />
        <MobileToolBtn
          icon={<Paintbrush size={20} />}
          onClick={() => toggleGroup('color')}
          active={expandedGroup === 'color'}
          label="Color"
        />

        <div className="w-px h-6 bg-gray-200" />

        <MobileToolBtn
          icon={<Filter size={20} />}
          onClick={() => setShowFilterDialog(true)}
          active={activeFilters.length > 0}
          label="Filter"
        />
        <MobileToolBtn
          icon={<BarChart3 size={20} />}
          onClick={() => setShowChartDialog(true)}
          label="Chart"
        />
      </div>
    </div>
  );
}

function MobileToolBtn({
  icon,
  onClick,
  active,
  disabled,
  label,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors active:scale-95 ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
      } ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

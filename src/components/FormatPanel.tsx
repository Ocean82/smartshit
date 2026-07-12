import React, { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { NUMBER_FORMATS } from '@/lib/formatUtils';
import { FULL_COLORS as COLORS } from '@/data/colors';
import type { CellFormat } from '@/types';

const BORDER_STYLES = [
  { value: '', label: 'None' },
  { value: '1px solid', label: 'Thin' },
  { value: '2px solid', label: 'Medium' },
  { value: '3px solid', label: 'Thick' },
  { value: '1px dashed', label: 'Dashed' },
  { value: '1px dotted', label: 'Dotted' },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36];

export function FormatPanel() {
  const { showFormatPanel, setShowFormatPanel, selection, getActiveSheet, setRangeFormat, applyOuterBorders } = useStore();
  const sheet = getActiveSheet();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [borderStyle, setBorderStyle] = useState('1px solid');
  const [borderColor, setBorderColor] = useState('#000000');

  const hasSelection = !!selection;
  const selectedCellId = selection
    ? refToCell(Math.min(selection.startRow, selection.endRow), Math.min(selection.startCol, selection.endCol))
    : null;
  const cellFormat = selectedCellId ? sheet.cells[selectedCellId]?.format : undefined;

  const toggle = useCallback((section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const borderValue = borderStyle ? `${borderStyle} ${borderColor}` : '';

  const applyBorder = useCallback((side: 'top' | 'right' | 'bottom' | 'left') => {
    if (!hasSelection) return;
    setRangeFormat({ borders: { [side]: borderValue } });
  }, [borderValue, hasSelection, setRangeFormat]);

  const applyAllBorders = useCallback(() => {
    if (!hasSelection) return;
    setRangeFormat({
      borders: {
        top: borderValue,
        right: borderValue,
        bottom: borderValue,
        left: borderValue,
      },
    });
  }, [borderValue, hasSelection, setRangeFormat]);

  const clearBorders = useCallback(() => {
    if (!hasSelection) return;
    setRangeFormat({
      borders: { top: '', right: '', bottom: '', left: '' },
    });
  }, [hasSelection, setRangeFormat]);

  const applyOuter = useCallback(() => {
    if (!hasSelection) return;
    applyOuterBorders(borderValue);
  }, [borderValue, hasSelection, applyOuterBorders]);

  if (!showFormatPanel) return null;

  function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
      <div className="border-b border-gray-100">
        <button
          type="button"
          onClick={() => toggle(id)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          {title}
          <span className="text-gray-400">{collapsed[id] ? '\u25B6' : '\u25BC'}</span>
        </button>
        {!collapsed[id] && <div className="px-4 pb-3">{children}</div>}
      </div>
    );
  }

  function toggleStyle(key: 'bold' | 'italic' | 'underline') {
    if (!hasSelection) return;
    setRangeFormat({ [key]: !cellFormat?.[key] } as Partial<CellFormat>);
  }

  const controlClass = hasSelection
    ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
    : 'border-gray-100 text-gray-300 cursor-not-allowed';

  return (
    <div className="w-[280px] border-l border-gray-200 bg-white h-full overflow-y-auto shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Format</h3>
        <button
          type="button"
          onClick={() => setShowFormatPanel(false)}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close format panel"
        >
          ✕
        </button>
      </div>

      {!hasSelection && (
        <p className="px-4 py-2 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100">
          Select a cell or range to format.
        </p>
      )}

      <Section id="text" title="Text">
        <div className={`space-y-2 ${!hasSelection ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex gap-2">
            <select
              value={cellFormat?.fontSize || 13}
              onChange={(e) => setRangeFormat({ fontSize: parseInt(e.target.value, 10) })}
              className="border border-gray-200 rounded px-2 py-1 text-xs flex-1"
              aria-label="Font size"
              disabled={!hasSelection}
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            {([
              ['bold', 'B'],
              ['italic', 'I'],
              ['underline', 'U'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                disabled={!hasSelection}
                onClick={() => toggleStyle(key)}
                className={`w-8 h-8 rounded border text-xs font-bold ${
                  cellFormat?.[key]
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : controlClass
                }`}
                title={key}
              >
                {label}
              </button>
            ))}
            <div className="w-px bg-gray-200 mx-1" />
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                disabled={!hasSelection}
                onClick={() => setRangeFormat({ textAlign: align })}
                className={`w-8 h-8 rounded border text-xs ${
                  cellFormat?.textAlign === align
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : controlClass
                }`}
                title={`Align ${align}`}
              >
                {align === 'left' ? '⫷' : align === 'center' ? '☰' : '⫸'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div>
              <div className="text-[10px] text-gray-500 mb-1">Text Color</div>
              <div className="grid grid-cols-7 gap-0.5">
                {COLORS.map((c) => (
                  <button
                    key={`font-${c}`}
                    type="button"
                    disabled={!hasSelection}
                    className="w-4 h-4 rounded border border-gray-200 hover:scale-110 disabled:hover:scale-100"
                    style={{ backgroundColor: c }}
                    onClick={() => setRangeFormat({ fontColor: c })}
                    title={`Text color ${c}`}
                    aria-label={`Text color ${c}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-1">Fill Color</div>
              <div className="grid grid-cols-7 gap-0.5">
                {COLORS.map((c) => (
                  <button
                    key={`fill-${c}`}
                    type="button"
                    disabled={!hasSelection}
                    className="w-4 h-4 rounded border border-gray-200 hover:scale-110 disabled:hover:scale-100"
                    style={{ backgroundColor: c }}
                    onClick={() => setRangeFormat({ bgColor: c })}
                    title={`Fill color ${c}`}
                    aria-label={`Fill color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="number" title="Number">
        <div className={`space-y-2 ${!hasSelection ? 'opacity-50 pointer-events-none' : ''}`}>
          <select
            value={cellFormat?.numberFormat || ''}
            onChange={(e) => setRangeFormat({ numberFormat: e.target.value })}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
            aria-label="Number format"
            disabled={!hasSelection}
          >
            {NUMBER_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </Section>

      <Section id="border" title="Border">
        <div className={`space-y-2 ${!hasSelection ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex gap-2">
            <select
              value={borderStyle}
              onChange={(e) => setBorderStyle(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs flex-1"
              aria-label="Border style"
              disabled={!hasSelection}
            >
              {BORDER_STYLES.map((s) => (
                <option key={s.value || 'none'} value={s.value}>{s.label}</option>
              ))}
            </select>
            <input
              type="color"
              value={borderColor}
              onChange={(e) => setBorderColor(e.target.value)}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Border color"
              disabled={!hasSelection}
            />
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={!hasSelection}
              onClick={applyAllBorders}
              className={`flex-1 h-7 rounded border text-[10px] ${controlClass}`}
            >
              All
            </button>
            <button
              type="button"
              disabled={!hasSelection}
              onClick={clearBorders}
              className={`flex-1 h-7 rounded border text-[10px] ${controlClass}`}
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!hasSelection}
              onClick={applyOuter}
              className={`flex-1 h-7 rounded border text-[10px] ${controlClass}`}
            >
              Outer
            </button>
          </div>
          <div className="flex justify-center">
            <div className="grid grid-cols-3 gap-1 w-32">
              <div />
              <button
                type="button"
                disabled={!hasSelection}
                onClick={() => applyBorder('top')}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px] disabled:hover:bg-gray-50"
              >
                Top
              </button>
              <div />
              <button
                type="button"
                disabled={!hasSelection}
                onClick={() => applyBorder('left')}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px] disabled:hover:bg-gray-50"
              >
                Left
              </button>
              <div className="h-6 bg-gray-100 border border-gray-200 rounded" />
              <button
                type="button"
                disabled={!hasSelection}
                onClick={() => applyBorder('right')}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px] disabled:hover:bg-gray-50"
              >
                Right
              </button>
              <div />
              <button
                type="button"
                disabled={!hasSelection}
                onClick={() => applyBorder('bottom')}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px] disabled:hover:bg-gray-50"
              >
                Bottom
              </button>
              <div />
            </div>
          </div>
        </div>
      </Section>

      <Section id="fill" title="Fill">
        <div className={`grid grid-cols-7 gap-1 ${!hasSelection ? 'opacity-50 pointer-events-none' : ''}`}>
          {COLORS.map((c) => (
            <button
              key={`panel-fill-${c}`}
              type="button"
              disabled={!hasSelection}
              className="w-6 h-6 rounded border border-gray-200 hover:scale-110 disabled:hover:scale-100"
              style={{ backgroundColor: c }}
              onClick={() => setRangeFormat({ bgColor: c })}
              title={`Fill ${c}`}
              aria-label={`Fill ${c}`}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

/**
 * GridCell — renders a single spreadsheet cell with all its visual states:
 * - Selection highlighting (active, selected, crosshair)
 * - Inline editing (text input or dropdown for list validation)
 * - Conditional formatting (data bars, color scales, icon sets)
 * - Pending AI action preview
 * - Validation errors & cell notes indicators
 * - Checkbox cells
 *
 * Extracted from SpreadsheetGrid to reduce the monolithic component size
 * and enable per-cell memoization (React.memo prevents re-render when
 * only unrelated cells change).
 */

import React, { memo } from 'react'
import type { CellData, CellFormat } from '@/types'
import { formatCellValue } from '@/lib/formatUtils'
import { resolveCellFormat, getDataBarRule, getDataBarInfo, getColorScaleRule, computeColorScaleBg, getIconSetRule, computeIconForCell } from '@/lib/conditionalFormat'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingCellChange {
  oldValue?: unknown
  oldFormula?: string
  newValue?: unknown
  newFormula?: string
}

export interface GridCellProps {
  row: number
  col: number
  cellId: string
  cellData: CellData | undefined
  computed: string
  colWidth: number
  cellHeight: number
  isEditing: boolean
  isActive: boolean
  isSelected: boolean
  isCrosshair: boolean
  editValue: string
  hasNote: boolean
  noteText: string
  pendingChange: PendingCellChange | null
  dataBarPeers: number[]
  colorScalePeers: number[]
  iconSetPeers: number[]
  getCellStyle: (format: CellFormat | undefined, cellValue?: string | number | boolean | null) => React.CSSProperties
  colOffset: number
  // Refs
  editContainerRef?: React.Ref<HTMLDivElement>
  inputRef?: React.Ref<HTMLInputElement>
  // Event handlers
  onMouseDown: (row: number, col: number, e: React.MouseEvent) => void
  onMouseMove: (row: number, col: number) => void
  onDoubleClick: (row: number, col: number) => void
  onContextMenu: (e: React.MouseEvent, row: number, col: number) => void
  onEditChange: (val: string) => void
  onEditBlur: () => void
  onCheckboxToggle: (cellId: string, cellData: CellData) => void
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function isCellChecked(value: string | number | boolean | null | undefined, checkedValue?: string): boolean {
  const checked = checkedValue ?? 'TRUE'
  const current = String(value ?? '').toUpperCase()
  return current === checked.toUpperCase() || current === '1' || current === 'YES' || current === 'TRUE'
}

// ─── Component ───────────────────────────────────────────────────────────────

export const GridCell = memo(function GridCell({
  row,
  col,
  cellId,
  cellData,
  computed,
  colWidth,
  cellHeight,
  isEditing,
  isActive,
  isSelected,
  isCrosshair,
  editValue,
  hasNote,
  noteText,
  pendingChange,
  dataBarPeers,
  colorScalePeers,
  iconSetPeers,
  getCellStyle,
  colOffset,
  editContainerRef,
  inputRef,
  onMouseDown,
  onMouseMove,
  onDoubleClick,
  onContextMenu,
  onEditChange,
  onEditBlur,
  onCheckboxToggle,
}: GridCellProps) {
  const rawValue = (computed || cellData?.value) ?? null
  const hasFormula = !!cellData?.formula

  // Conditional formatting
  const dataBarRule = getDataBarRule(cellData?.format, computed)
  const dataBarInfo = dataBarRule ? getDataBarInfo(computed, dataBarPeers) : null
  const colorScaleRule = getColorScaleRule(cellData?.format)
  const colorScaleBg = colorScaleRule?.colorScaleConfig
    ? computeColorScaleBg(computed, colorScalePeers, colorScaleRule.colorScaleConfig)
    : null
  const iconSetRule = getIconSetRule(cellData?.format)
  const cellIcon = iconSetRule?.iconSetConfig
    ? computeIconForCell(computed, iconSetPeers, iconSetRule.iconSetConfig)
    : null

  return (
    <div
      ref={isEditing ? editContainerRef : undefined}
      className={`border-b border-r shrink-0 relative transition-shadow group/cell ${
        pendingChange
          ? 'ring-2 ring-emerald-400 ring-inset z-10 bg-emerald-50/80'
          : isActive
            ? 'ring-2 ring-blue-500 ring-inset z-10 bg-white'
            : isSelected
              ? 'bg-blue-50/60 border-blue-200'
              : isCrosshair
                ? 'bg-blue-50/30 border-gray-200'
                : 'border-gray-200 hover:bg-blue-50/20'
      }`}
      style={{
        width: colWidth,
        height: cellHeight,
        position: 'absolute',
        left: colOffset,
        ...getCellStyle(resolveCellFormat(cellData?.format, computed), rawValue),
        ...(colorScaleBg && !pendingChange ? { backgroundColor: colorScaleBg } : {}),
        ...(pendingChange ? { backgroundColor: undefined } : {}),
      }}
      onMouseDown={(e) => onMouseDown(row, col, e)}
      onMouseMove={() => onMouseMove(row, col)}
      onDoubleClick={() => onDoubleClick(row, col)}
      onContextMenu={(e) => onContextMenu(e, row, col)}
    >
      {/* Data bar overlay */}
      {dataBarInfo != null && dataBarRule && !pendingChange && (
        <div
          className="absolute inset-y-1 rounded-sm pointer-events-none opacity-50"
          style={{
            width: `${dataBarInfo.width}%`,
            left: dataBarInfo.isNegative
              ? `${dataBarInfo.startPoint - dataBarInfo.width}%`
              : `${dataBarInfo.startPoint}%`,
            backgroundColor: dataBarInfo.isNegative
              ? (dataBarRule.dataBarNegativeColor || '#F87171')
              : (dataBarRule.dataBarColor || '#93C5FD'),
            ...(dataBarRule.dataBarGradient ? {
              background: `linear-gradient(to right, ${
                dataBarInfo.isNegative
                  ? (dataBarRule.dataBarNegativeColor || '#F87171')
                  : (dataBarRule.dataBarColor || '#93C5FD')
              }80, ${
                dataBarInfo.isNegative
                  ? (dataBarRule.dataBarNegativeColor || '#F87171')
                  : (dataBarRule.dataBarColor || '#93C5FD')
              })`,
            } : {}),
          }}
        />
      )}

      {/* Icon set */}
      {cellIcon && !pendingChange && (
        <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none z-[1]" aria-hidden="true">
          {cellIcon}
        </span>
      )}

      {/* Cell content: editing or display */}
      {isEditing && cellData?.validation?.type === 'list' ? (
        <select
          className="absolute inset-0 w-full h-full px-1.5 text-[13px] border-0 outline-none bg-white z-20 font-sans"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditBlur}
          autoFocus
        >
          <option value="">(empty)</option>
          {cellData.validation.values?.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      ) : isEditing ? (
        <input
          ref={inputRef}
          className="absolute inset-0 w-full h-full px-1.5 text-[13px] border-0 outline-none bg-white z-20 font-sans"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditBlur}
        />
      ) : (
        <div className="flex items-center h-full">
          <div
            className="px-1.5 truncate w-full"
            style={{
              fontSize: cellData?.format?.fontSize ? `${cellData.format.fontSize}px` : '13px',
              textAlign: cellData?.format?.textAlign
                ? cellData.format.textAlign
                : (typeof cellData?.value === 'number' || (computed && !isNaN(Number(computed)) && computed !== ''))
                  ? 'right'
                  : undefined,
            }}
            title={hasFormula ? `${cellData?.formula} = ${formatCellValue(rawValue, cellData?.format?.numberFormat)}` : formatCellValue(rawValue, cellData?.format?.numberFormat)}
          >
            {pendingChange
              ? formatCellValue((pendingChange.newValue ?? pendingChange.newFormula ?? '') as string | number | null, cellData?.format?.numberFormat)
              : formatCellValue(rawValue, cellData?.format?.numberFormat)}
          </div>
        </div>
      )}

      {/* Pending change tooltip */}
      {pendingChange && !isEditing && (
        <>
          <span className="absolute top-0.5 right-0.5 text-[8px] leading-none bg-emerald-500 text-white font-bold px-0.5 rounded z-20">
            AI
          </span>
          <div className="absolute bottom-full right-0 mb-1 hidden group-hover/cell:block bg-gray-900 text-white p-2 rounded-lg shadow-xl border border-emerald-400 w-48 text-[10px] z-50 pointer-events-none">
            <div className="font-semibold text-emerald-300 mb-1">Proposed change</div>
            <div className="text-gray-400 line-through truncate">
              Old: {String(pendingChange.oldValue ?? pendingChange.oldFormula ?? '(empty)')}
            </div>
            <div className="text-emerald-200 font-mono mt-0.5 truncate">
              → {String(pendingChange.newValue ?? pendingChange.newFormula ?? '')}
            </div>
          </div>
        </>
      )}

      {/* Validation error indicator */}
      {cellData?.validationError && (
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-red-500 border-l-[6px] border-l-transparent z-10"
          title={cellData.validationError} />
      )}

      {/* Cell note indicator */}
      {hasNote && (
        <div
          className="absolute top-0 right-0 w-0 h-0 border-t-[5px] border-t-purple-500 border-l-[5px] border-l-transparent z-[9] cursor-help"
          title={noteText}
        />
      )}

      {/* Checkbox cell */}
      {cellData?.validation?.type === 'checkbox' && !isEditing && (
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer z-[1]"
          onClick={(e) => {
            e.stopPropagation()
            onCheckboxToggle(cellId, cellData)
          }}
        >
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isCellChecked(cellData.value, cellData.validation?.checkedValue)
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-gray-400 bg-white'
          }`}>
            {isCellChecked(cellData.value, cellData.validation?.checkedValue) && (
              <span className="text-[10px] font-bold">✓</span>
            )}
          </div>
        </div>
      )}

      {/* List validation dropdown indicator */}
      {cellData?.validation?.type === 'list' && !isEditing && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">▾</div>
      )}

      {/* Active cell fill handle */}
      {isActive && !isEditing && (
        <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 cursor-crosshair z-20" />
      )}
    </div>
  )
})

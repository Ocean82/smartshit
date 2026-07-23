import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { colToLetter, refToCell } from '@/engine/spreadsheet'
import type { ConditionalFormatCondition } from '@/lib/conditionalFormat'
import { PRESET_COLOR_SCALES } from '@/lib/colorScale'
import { ICON_SETS } from '@/lib/conditionalFormat'
import type { CellFormat, ColorScaleStop, IconSetConfig, IconSetType } from '@/types'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type RuleCategory = 'highlight' | 'dataBar' | 'colorScale' | 'iconSet'

export function ConditionalFormatDialog({ isOpen, onClose }: Props) {
  const { selection, applyConditionalFormat, getActiveSheet, setCellFormat } = useStore()
  const [category, setCategory] = useState<RuleCategory>('highlight')
  const [condition, setCondition] = useState<ConditionalFormatCondition>('negative')
  const [threshold, setThreshold] = useState('0')
  const [color, setColor] = useState('#FEE2E2')
  const [colorScaleId, setColorScaleId] = useState('gyr')
  const [iconSetType, setIconSetType] = useState<IconSetType>('3Arrows')

  if (!isOpen) return null

  const column = selection
    ? Math.min(selection.startCol, selection.endCol)
    : 0

  const handleApply = () => {
    if (!selection) return
    const sheet = getActiveSheet()
    const headerRow = findHeaderRow(sheet)
    const lastRow = findLastDataRow(sheet)

    if (category === 'highlight' || category === 'dataBar') {
      const cond = category === 'dataBar' ? 'dataBar' : condition
      const needsThreshold = cond === 'gt' || cond === 'lt' || cond === 'eq'
      applyConditionalFormat(column, cond, color, needsThreshold ? Number(threshold) || 0 : 0)
    } else if (category === 'colorScale') {
      const preset = PRESET_COLOR_SCALES.find((p) => p.id === colorScaleId)
      if (!preset) return
      const rule = { type: 'colorScale' as const, value: 0, style: {}, colorScaleConfig: preset.stops }
      for (let r = headerRow + 1; r <= lastRow; r++) {
        const cellId = refToCell(r, column)
        const cell = sheet.cells[cellId]
        if (!cell || (cell.value == null && !cell.formula)) continue
        setCellFormat(cellId, { conditionalRules: [rule], bgColor: undefined })
      }
    } else if (category === 'iconSet') {
      const icons = ICON_SETS[iconSetType]
      if (!icons) return
      const count = icons.length
      // Generate evenly-spaced thresholds
      const thresholds: number[] = []
      for (let i = 1; i < count; i++) {
        thresholds.push(Math.round(((count - i) / count) * 100))
      }
      const config: IconSetConfig = { iconSetType, thresholds, showValue: true }
      const rule = { type: 'iconSet' as const, value: 0, style: {}, iconSetConfig: config }
      for (let r = headerRow + 1; r <= lastRow; r++) {
        const cellId = refToCell(r, column)
        const cell = sheet.cells[cellId]
        if (!cell || (cell.value == null && !cell.formula)) continue
        setCellFormat(cellId, { conditionalRules: [rule], bgColor: undefined })
      }
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[380px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Conditional Format</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        {!selection ? (
          <p className="text-xs text-amber-700">Select a column cell first.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Apply to column {colToLetter(column)}
            </p>

            {/* Category tabs */}
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(['highlight', 'dataBar', 'colorScale', 'iconSet'] as RuleCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                    category === cat ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {cat === 'highlight' ? 'Highlight' : cat === 'dataBar' ? 'Data Bar' : cat === 'colorScale' ? 'Color Scale' : 'Icons'}
                </button>
              ))}
            </div>

            {/* Highlight config */}
            {category === 'highlight' && (
              <>
                <label className="block text-xs text-gray-600">
                  Condition
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as ConditionalFormatCondition)}
                    className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="negative">Negative numbers</option>
                    <option value="positive">Positive numbers</option>
                    <option value="gt">Greater than</option>
                    <option value="lt">Less than</option>
                    <option value="eq">Equals</option>
                  </select>
                </label>
                {(condition === 'gt' || condition === 'lt' || condition === 'eq') && (
                  <label className="block text-xs text-gray-600">
                    Threshold
                    <input
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
                    />
                  </label>
                )}
                <label className="block text-xs text-gray-600">
                  Highlight color
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="mt-1 w-full h-8 border border-gray-200 rounded cursor-pointer"
                  />
                </label>
              </>
            )}

            {/* Data Bar config */}
            {category === 'dataBar' && (
              <label className="block text-xs text-gray-600">
                Bar color
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="mt-1 w-full h-8 border border-gray-200 rounded cursor-pointer"
                />
              </label>
            )}

            {/* Color Scale config */}
            {category === 'colorScale' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Choose a color gradient scale:</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_COLOR_SCALES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setColorScaleId(preset.id)}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        colorScaleId === preset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div
                        className="h-4 rounded mb-1"
                        style={{
                          background: `linear-gradient(to right, ${preset.stops.map((s) => s.color).join(', ')})`,
                        }}
                      />
                      <span className="text-[10px] text-gray-600">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Icon Set config */}
            {category === 'iconSet' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Choose an icon set:</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {(Object.keys(ICON_SETS) as IconSetType[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIconSetType(key)}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        iconSetType === key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-sm mb-0.5">{ICON_SETS[key].join(' ')}</div>
                      <span className="text-[10px] text-gray-500">{key}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selection}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

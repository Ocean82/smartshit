import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { colToLetter, refToCell } from '@/engine/spreadsheet'
import type { ConditionalFormatCondition } from '@/lib/conditionalFormat'
import { PRESET_COLOR_SCALES } from '@/lib/colorScale'
import { ICON_SETS } from '@/lib/conditionalFormat'
import type { IconSetConfig, IconSetType } from '@/types'
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
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus the dialog on open
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus()
  }, [isOpen])

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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose} style={{ background: 'oklch(0.1 0.02 250 / 0.5)', backdropFilter: 'blur(3px)' }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cf-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="rounded-t-2xl md:rounded-xl shadow-xl w-[380px] max-w-[calc(100vw-2rem)] max-h-[min(90dvh,100%)] overflow-y-auto p-5 space-y-3 outline-none"
        style={{ background: 'var(--surface-panel)', boxShadow: '0 24px 48px oklch(0.1 0 0 / 0.18), 0 4px 12px oklch(0.1 0 0 / 0.08)' }}
      >
        <div className="flex items-center justify-between">
          <h3 id="cf-dialog-title" className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Conditional Format</h3>
          <button type="button" onClick={onClose} className="p-2.5 rounded-md transition-colors" style={{ color: 'var(--neutral-400)' }} aria-label="Close">✕</button>
        </div>

        {!selection ? (
          <p className="text-xs" style={{ color: 'oklch(0.55 0.14 70)' }}>Select a column cell first.</p>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Apply to column {colToLetter(column)}
            </p>

            {/* Category tabs */}
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--neutral-100)' }}>
              {(['highlight', 'dataBar', 'colorScale', 'iconSet'] as RuleCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className="flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors"
                  style={
                    category === cat
                      ? { background: 'var(--surface-panel)', color: 'var(--ink-primary)', boxShadow: 'var(--shadow-sm)' }
                      : { color: 'var(--ink-secondary)' }
                  }
                >
                  {cat === 'highlight' ? 'Highlight' : cat === 'dataBar' ? 'Data Bar' : cat === 'colorScale' ? 'Color Scale' : 'Icons'}
                </button>
              ))}
            </div>

            {/* Highlight config */}
            {category === 'highlight' && (
              <>
                <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  Condition
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as ConditionalFormatCondition)}
                    className="mt-1 w-full border rounded px-2 py-1.5 text-sm outline-none transition-colors focus:ring-2"
                    style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
                  >
                    <option value="negative">Negative numbers</option>
                    <option value="positive">Positive numbers</option>
                    <option value="gt">Greater than</option>
                    <option value="lt">Less than</option>
                    <option value="eq">Equals</option>
                  </select>
                </label>
                {(condition === 'gt' || condition === 'lt' || condition === 'eq') && (
                  <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
                    Threshold
                    <input
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="mt-1 w-full border rounded px-2 py-1.5 text-sm outline-none transition-colors focus:ring-2"
                      style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
                    />
                  </label>
                )}
                <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  Highlight color
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="mt-1 w-full h-8 border rounded cursor-pointer"
                    style={{ borderColor: 'var(--neutral-200)' }}
                  />
                </label>
              </>
            )}

            {/* Data Bar config */}
            {category === 'dataBar' && (
              <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Bar color
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="mt-1 w-full h-8 border rounded cursor-pointer"
                  style={{ borderColor: 'var(--neutral-200)' }}
                />
              </label>
            )}

            {/* Color Scale config */}
            {category === 'colorScale' && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>Choose a color gradient scale:</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_COLOR_SCALES.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setColorScaleId(preset.id)}
                      className="p-2 rounded-lg border text-left transition-all"
                      style={
                        colorScaleId === preset.id
                          ? { borderColor: 'var(--accent-500)', background: 'var(--accent-50)' }
                          : { borderColor: 'var(--neutral-200)' }
                      }
                    >
                      <div
                        className="h-4 rounded mb-1"
                        style={{
                          background: `linear-gradient(to right, ${preset.stops.map((s) => s.color).join(', ')})`,
                        }}
                      />
                      <span className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Icon Set config */}
            {category === 'iconSet' && (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>Choose an icon set:</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {(Object.keys(ICON_SETS) as IconSetType[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIconSetType(key)}
                      className="p-2 rounded-lg border text-left transition-all"
                      style={
                        iconSetType === key
                          ? { borderColor: 'var(--accent-500)', background: 'var(--accent-50)' }
                          : { borderColor: 'var(--neutral-200)' }
                      }
                    >
                      <div className="text-sm mb-0.5">{ICON_SETS[key].join(' ')}</div>
                      <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{key}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded-lg border transition-colors" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-secondary)', background: 'var(--surface-panel)' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selection}
            className="px-3 py-1.5 text-xs rounded-lg font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: 'var(--accent-600)' }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

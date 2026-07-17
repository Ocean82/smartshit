import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { colToLetter } from '@/engine/spreadsheet'
import type { ConditionalFormatCondition } from '@/lib/conditionalFormat'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function ConditionalFormatDialog({ isOpen, onClose }: Props) {
  const { selection, applyConditionalFormat } = useStore()
  const [condition, setCondition] = useState<ConditionalFormatCondition>('negative')
  const [threshold, setThreshold] = useState('0')
  const [color, setColor] = useState('#FEE2E2')

  if (!isOpen) return null

  const column = selection
    ? Math.min(selection.startCol, selection.endCol)
    : 0

  const handleApply = () => {
    if (!selection) return
    const needsThreshold = condition === 'gt' || condition === 'lt' || condition === 'eq'
    applyConditionalFormat(
      column,
      condition,
      color,
      needsThreshold ? Number(threshold) || 0 : 0,
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[360px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Conditional Format</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        {!selection ? (
          <p className="text-xs text-amber-700">Select a column cell first.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Apply to column {colToLetter(column)}. Rules re-evaluate when values change.
            </p>
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
                <option value="dataBar">Data bars</option>
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
              {condition === 'dataBar' ? 'Bar color' : 'Highlight color'}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-1 w-full h-9 border border-gray-200 rounded cursor-pointer"
              />
            </label>
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

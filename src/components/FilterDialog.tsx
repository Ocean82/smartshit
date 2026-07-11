import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { colToLetter } from '@/engine/spreadsheet'
import type { FilterCondition } from '@/lib/rowFilter'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function FilterDialog({ isOpen, onClose }: Props) {
  const { selection, activeFilters, setFilters } = useStore()
  const [condition, setCondition] = useState<FilterCondition>('equals')
  const [value, setValue] = useState('')

  if (!isOpen) return null

  const column = selection
    ? Math.min(selection.startCol, selection.endCol)
    : 0

  const handleApply = () => {
    if (!selection) return
    setFilters([{
      column,
      condition,
      value,
    }])
    onClose()
  }

  const handleClear = () => {
    setFilters([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[360px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Filter</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        {!selection ? (
          <p className="text-xs text-amber-700">Select a column cell first.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Column {colToLetter(column)}
              {activeFilters.length > 0 ? ` · ${activeFilters.length} active filter(s)` : ''}
            </p>
            <label className="block text-xs text-gray-600">
              Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as FilterCondition)}
                className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
              >
                <option value="equals">Equals</option>
                <option value="contains">Contains</option>
                <option value="gt">Greater than</option>
                <option value="lt">Less than</option>
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Value
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-sm"
                placeholder="Filter value"
              />
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClear} className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50">
            Clear filters
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selection || value === ''}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

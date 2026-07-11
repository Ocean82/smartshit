import React, { useState } from 'react'
import { useStore } from '@/store/useStore'
import { colToLetter } from '@/engine/spreadsheet'
import type { FilterCondition } from '@/lib/rowFilter'

interface Props {
  isOpen: boolean
  onClose: () => void
}

function conditionLabel(condition: string | undefined): string {
  if (condition === 'contains') return 'contains'
  if (condition === 'gt') return '>'
  if (condition === 'lt') return '<'
  return '='
}

export function FilterDialog({ isOpen, onClose }: Props) {
  const { selection, activeFilters, setFilters } = useStore()
  const [condition, setCondition] = useState<FilterCondition>('equals')
  const [value, setValue] = useState('')

  if (!isOpen) return null

  const column = selection
    ? Math.min(selection.startCol, selection.endCol)
    : 0

  const needsValue = condition !== 'equals'
  const canApply = !!selection && (!needsValue || value !== '')

  const handleApply = () => {
    if (!selection || !canApply) return
    const next = [
      ...activeFilters.filter((f) => f.column !== column),
      { column, condition, value },
    ]
    setFilters(next)
    onClose()
  }

  const handleClear = () => {
    setFilters([])
    onClose()
  }

  const handleRemove = (col: number) => {
    setFilters(activeFilters.filter((f) => f.column !== col))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[360px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Filter</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">✕</button>
        </div>

        {activeFilters.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Active filters</p>
            {activeFilters.map((f) => (
              <div
                key={`filter-${f.column}`}
                className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded px-2 py-1.5"
              >
                <span className="text-gray-700 truncate">
                  {colToLetter(f.column)} {conditionLabel(f.condition)}{' '}
                  {f.value === '' || f.value == null ? '(blank)' : String(f.value)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(f.column)}
                  className="text-gray-400 hover:text-red-600 shrink-0"
                  aria-label={`Remove filter on column ${colToLetter(f.column)}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!selection ? (
          <p className="text-xs text-amber-700">Select a column cell first.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              Column {colToLetter(column)}
              {activeFilters.some((f) => f.column === column)
                ? ' · will replace existing filter on this column'
                : ''}
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
                placeholder={condition === 'equals' ? 'Leave empty for blanks' : 'Filter value'}
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
            disabled={!canApply}
            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

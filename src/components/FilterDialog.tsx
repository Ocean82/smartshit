import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { colToLetter } from '@/engine/spreadsheet'
import type { FilterConditionType } from '@/lib/rowFilter'

interface Props {
  isOpen: boolean
  onClose: () => void
}

function conditionLabel(condition: string | undefined): string {
  const labels: Record<string, string> = {
    equals: '=',
    notEquals: '≠',
    contains: 'contains',
    notContains: '!contains',
    startsWith: 'starts',
    endsWith: 'ends',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    between: '↔',
    notBetween: '!↔',
    isEmpty: 'empty',
    isNotEmpty: '!empty',
    wildcard: '∗',
  }
  return labels[condition ?? ''] ?? '='
}

export function FilterDialog({ isOpen, onClose }: Props) {
  const { selection, activeFilters, setFilters } = useStore()
  const [condition, setCondition] = useState<FilterConditionType>('equals')
  const [value, setValue] = useState('')
  const [value2, setValue2] = useState('')
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

  const noValueNeeded = condition === 'isEmpty' || condition === 'isNotEmpty'
  const needsSecondValue = condition === 'between' || condition === 'notBetween'
  const canApply = !!selection && (noValueNeeded || value !== '')

  const handleApply = () => {
    if (!selection || !canApply) return
    const next = [
      ...activeFilters.filter((f) => f.column !== column),
      {
        column,
        condition,
        value: noValueNeeded ? undefined : value,
        ...(needsSecondValue ? { value2 } : {}),
      },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose} style={{ background: 'oklch(0.1 0.02 250 / 0.5)', backdropFilter: 'blur(3px)' }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-dialog-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl shadow-xl w-[360px] max-w-[calc(100vw-2rem)] max-h-[min(90dvh,100%)] overflow-y-auto p-5 space-y-3 outline-none"
        style={{ background: 'var(--surface-panel)', boxShadow: '0 24px 48px oklch(0.1 0 0 / 0.18), 0 4px 12px oklch(0.1 0 0 / 0.08)' }}
      >
        <div className="flex items-center justify-between">
          <h3 id="filter-dialog-title" className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Filter</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md transition-colors" style={{ color: 'var(--neutral-400)' }} aria-label="Close">✕</button>
        </div>

        {activeFilters.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Active filters</p>
            {activeFilters.map((f) => (
              <div
                key={`filter-${f.column}`}
                className="flex items-center justify-between gap-2 text-xs rounded px-2 py-1.5"
                style={{ background: 'var(--neutral-100)', color: 'var(--ink-primary)' }}
              >
                <span className="truncate">
                  {colToLetter(f.column)} {conditionLabel(f.condition)}{' '}
                  {f.value === '' || f.value == null ? '(blank)' : String(f.value)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(f.column)}
                  className="shrink-0 text-xs transition-colors"
                  style={{ color: 'var(--neutral-400)' }}
                  aria-label={`Remove filter on column ${colToLetter(f.column)}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!selection ? (
          <p className="text-xs" style={{ color: 'oklch(0.55 0.14 70)' }}>Select a column cell first.</p>
        ) : (
          <>
            <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Column {colToLetter(column)}
              {activeFilters.some((f) => f.column === column)
                ? ' · will replace existing filter on this column'
                : ''}
            </p>
            <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Condition
              <select
                value={condition}
                onChange={(e) => {
                  setCondition(e.target.value as FilterConditionType);
                  setValue2('');
                }}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm outline-none transition-colors focus:ring-2"
                style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
              >
                <option value="equals">Equals</option>
                <option value="notEquals">Does not equal</option>
                <option value="contains">Contains</option>
                <option value="notContains">Does not contain</option>
                <option value="startsWith">Starts with</option>
                <option value="endsWith">Ends with</option>
                <option value="gt">Greater than</option>
                <option value="gte">Greater than or equal</option>
                <option value="lt">Less than</option>
                <option value="lte">Less than or equal</option>
                <option value="between">Between</option>
                <option value="notBetween">Not between</option>
                <option value="isEmpty">Is empty</option>
                <option value="isNotEmpty">Is not empty</option>
                <option value="wildcard">Wildcard (* and ?)</option>
              </select>
            </label>
            <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Value
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 w-full border rounded px-2 py-1.5 text-sm outline-none transition-colors focus:ring-2"
                style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
                placeholder={condition === 'equals' ? 'Leave empty for blanks' : 'Filter value'}
                disabled={noValueNeeded}
              />
            </label>
            {needsSecondValue && (
              <label className="block text-xs" style={{ color: 'var(--ink-secondary)' }}>
                Second value
                <input
                  value={value2}
                  onChange={(e) => setValue2(e.target.value)}
                  className="mt-1 w-full border rounded px-2 py-1.5 text-sm outline-none transition-colors focus:ring-2"
                  style={{ borderColor: 'var(--neutral-200)', background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
                  placeholder="Upper bound"
                />
              </label>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClear} className="px-3 py-1.5 text-xs rounded-lg border transition-colors" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-secondary)', background: 'var(--surface-panel)' }}>
            Clear filters
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
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

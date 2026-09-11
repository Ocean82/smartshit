/**
 * Column header filter/sort popover (Excel-like value checklist).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store/useStore'
import { AnchoredPanel } from '@/components/AnchoredPanel'
import { collectColumnUniqueValues } from '@/lib/columnFilterValues'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

interface ColumnFilterButtonProps {
  col: number
  isFiltered: boolean
}

export function ColumnFilterButton({ col, isFiltered }: ColumnFilterButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(() => new Set())

  const { activeFilters, setFilters, sortByColumn, getComputedValue, getActiveSheet } = useStore(useShallow((s) => ({
    activeFilters: s.activeFilters,
    setFilters: s.setFilters,
    sortByColumn: s.sortByColumn,
    getComputedValue: s.getComputedValue,
    getActiveSheet: s.getActiveSheet,
  })))

  const sheet = getActiveSheet()
  const uniques = useMemo(() => {
    if (!open) return [] as string[]
    const headerRow = findHeaderRow(sheet)
    const endRow = findLastDataRow(sheet)
    return collectColumnUniqueValues({
      startRow: headerRow + 1,
      endRow: Math.max(headerRow + 1, endRow),
      column: col,
      getDisplay: (r, c) => getComputedValue(r, c),
    })
  }, [open, sheet, col, getComputedValue])

  useEffect(() => {
    if (!open) return
    const existing = activeFilters.find((f) => f.column === col)
    if (existing?.values && existing.condition == null) {
      const want = new Set(existing.values.map((v) => String(v).toLowerCase()))
      if (existing.includeBlank) want.add('')
      const mapped = new Set(uniques.filter((u) => want.has(u.toLowerCase())))
      setChecked(mapped)
    } else {
      setChecked(new Set(uniques))
    }
  }, [open, uniques, activeFilters, col])

  const allSelected = uniques.length > 0 && uniques.every((v) => checked.has(v))

  const toggle = (value: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const apply = () => {
    const others = activeFilters.filter((f) => f.column !== col)
    if (allSelected) {
      setFilters(others)
    } else {
      const values = [...checked].filter((v) => v !== '')
      const includeBlank = checked.has('')
      setFilters([...others, {
        column: col,
        values,
        includeBlank: includeBlank || undefined,
      }])
    }
    setOpen(false)
  }

  const clearFilter = () => {
    setFilters(activeFilters.filter((f) => f.column !== col))
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Filter / sort column"
        aria-label={`Filter column ${col + 1}`}
        aria-expanded={open}
        className={`ml-0.5 text-[9px] leading-none px-0.5 rounded ${
          isFiltered ? 'text-amber-600 bg-amber-50' : 'text-gray-400 opacity-0 group-hover:opacity-100'
        } hover:bg-gray-200`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        ⏷
      </button>
      <AnchoredPanel
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={btnRef}
        width={220}
        maxHeight={320}
        align="end"
        aria-label="Column filter"
        className="rounded-lg shadow-xl border border-gray-200 text-xs z-50"
        style={{ background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
      >
        <div className="py-1">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
            onClick={() => { sortByColumn(col, 'asc'); setOpen(false) }}
          >
            Sort A to Z
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
            onClick={() => { sortByColumn(col, 'desc'); setOpen(false) }}
          >
            Sort Z to A
          </button>
          <div className="border-t border-gray-200 my-1" />
          <div className="flex gap-2 px-3 py-1">
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => setChecked(new Set(uniques))}
            >
              Select All
            </button>
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => setChecked(new Set())}
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto border-t border-b border-gray-100 px-1 py-1">
            {uniques.length === 0 ? (
              <p className="px-2 py-1 text-gray-400">No values</p>
            ) : (
              uniques.map((v) => (
                <label
                  key={v === '' ? '__blank__' : v}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked.has(v)}
                    onChange={() => toggle(v)}
                  />
                  <span className="truncate">{v === '' ? '(blank)' : v}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex justify-between gap-2 px-3 py-2">
            <button type="button" className="text-gray-500 hover:underline" onClick={clearFilter}>
              Clear filter
            </button>
            <button
              type="button"
              className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={apply}
            >
              Apply
            </button>
          </div>
        </div>
      </AnchoredPanel>
    </>
  )
}

/**
 * Name Manager — list / add / edit / delete workbook named ranges.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { cellToRef } from '@/engine/spreadsheet'
import { X, Plus, Trash2 } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { selectionToAbsRange } from '@/lib/namedRanges'
import type { NamedRange } from '@/types'

export function NameManagerDialog() {
  const show = useStore((s) => s.showNameManagerDialog)
  const setShow = useStore((s) => s.setShowNameManagerDialog)
  const namedRanges = useStore((s) => s.workbook.namedRanges ?? [])
  const sheets = useStore((s) => s.workbook.sheets)
  const selection = useStore((s) => s.selection)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const upsertNamedRange = useStore((s) => s.upsertNamedRange)
  const deleteNamedRange = useStore((s) => s.deleteNamedRange)
  const setSelection = useStore((s) => s.setSelection)

  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [range, setRange] = useState('')
  const [sheetId, setSheetId] = useState(activeSheetId)
  const [error, setError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const containerRef = useFocusTrap<HTMLDivElement>(show, () => setShow(false))

  const resetForm = useCallback((seedRange = true) => {
    setEditing(null)
    setName('')
    setSheetId(activeSheetId)
    setRange(seedRange && selection ? selectionToAbsRange(selection) : '')
    setError('')
  }, [activeSheetId, selection])

  useEffect(() => {
    if (!show) return
    resetForm(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }, [show, resetForm])

  const onClose = () => setShow(false)

  const startEdit = (nr: NamedRange) => {
    setEditing(nr.name)
    setName(nr.name)
    setRange(nr.range)
    setSheetId(nr.sheetId)
    setError('')
  }

  const save = () => {
    const result = upsertNamedRange(
      { name, sheetId, range },
      editing ? { previousName: editing } : undefined,
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    resetForm(false)
  }

  const goTo = (nr: NamedRange) => {
    const sheet = sheets.find((s) => s.id === nr.sheetId)
    if (!sheet) return
    useStore.getState().setActiveSheet(nr.sheetId)
    const m = nr.range.match(/^\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/i)
    if (!m) return
    const start = cellToRef(`${m[1]}${m[2]}`)
    const end = m[3] ? cellToRef(`${m[3]}${m[4]}`) : start
    setSelection({
      startRow: start.row,
      startCol: start.col,
      endRow: end.row,
      endCol: end.col,
    })
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-start justify-center p-4 md:pt-[12vh]">
      <div className="absolute inset-0" style={{ background: 'oklch(0.1 0.02 250 / 0.4)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-manager-title"
        className="relative rounded-t-2xl md:rounded-xl shadow-2xl border w-[min(520px,calc(100vw-2rem))] max-h-[min(80dvh,560px)] flex flex-col bg-white"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 id="name-manager-title" className="text-sm font-semibold">Name Manager</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-[120px]">
          {namedRanges.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">No named ranges yet.</p>
          ) : (
            <ul className="divide-y">
              {namedRanges.map((nr) => {
                const sheetName = sheets.find((s) => s.id === nr.sheetId)?.name ?? '?'
                return (
                  <li key={nr.name} className="flex items-center gap-2 py-2 text-sm">
                    <button type="button" className="flex-1 text-left min-w-0" onClick={() => startEdit(nr)}>
                      <div className="font-medium truncate">{nr.name}</div>
                      <div className="text-[11px] text-gray-500 truncate">{sheetName}!{nr.range}</div>
                    </button>
                    <button type="button" className="text-[11px] text-blue-600 px-1" onClick={() => goTo(nr)}>Go To</button>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-red-50 text-red-600"
                      aria-label={`Delete ${nr.name}`}
                      onClick={() => deleteNamedRange(nr.name)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
            <Plus size={12} />
            {editing ? `Edit “${editing}”` : 'New name'}
            {editing && (
              <button type="button" className="ml-auto text-blue-600" onClick={() => resetForm(false)}>Cancel edit</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              ref={nameRef}
              className="col-span-1 px-2 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
            />
            <select
              className="col-span-1 px-2 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
            >
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              className="col-span-2 px-2 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-400 font-mono"
              placeholder="Range (B2:B10)"
              value={range}
              onChange={(e) => { setRange(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100">Close</button>
            <button type="button" onClick={save} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              {editing ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface Props {
  open: boolean
  onClose: () => void
}

export function RenameWorkbookDialog({ open, onClose }: Props) {
  const workbook = useStore((s) => s.workbook)
  const [name, setName] = useState('')
  const containerRef = useFocusTrap<HTMLDivElement>(open, onClose)

  useEffect(() => {
    if (open) setName(workbook.name)
  }, [open, workbook.name])

  if (!open) return null

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed) {
      useStore.setState((s) => { s.workbook.name = trimmed })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-workbook-title"
        className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rename-workbook-title" data-focus-on-open tabIndex={-1} className="text-base font-semibold text-gray-900">Rename Workbook</h2>
        <input
          className="mt-3 w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
          }}
          aria-label="Workbook name"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
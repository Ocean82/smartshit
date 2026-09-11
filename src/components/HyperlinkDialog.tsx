/**
 * Insert / Edit hyperlink dialog.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { refToCell } from '@/engine/spreadsheet'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { normalizeHyperlinkUrl } from '@/lib/hyperlink'

export function HyperlinkDialog() {
  const show = useStore((s) => s.showHyperlinkDialog)
  const setShow = useStore((s) => s.setShowHyperlinkDialog)
  const selection = useStore((s) => s.selection)
  const getActiveSheet = useStore((s) => s.getActiveSheet)
  const setCellValue = useStore((s) => s.setCellValue)
  const setCellHyperlink = useStore((s) => s.setCellHyperlink)
  const pushHistory = useStore((s) => s.pushHistory)

  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useFocusTrap<HTMLDivElement>(show, () => setShow(false))

  const cellId = selection
    ? refToCell(Math.min(selection.startRow, selection.endRow), Math.min(selection.startCol, selection.endCol))
    : null

  useEffect(() => {
    if (!show) return
    const existing = cellId ? getActiveSheet().cells[cellId]?.hyperlink?.url : ''
    setUrl(existing ?? '')
    setError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [show, cellId, getActiveSheet])

  const onClose = useCallback(() => setShow(false), [setShow])

  const handleSubmit = useCallback(() => {
    if (!cellId) {
      onClose()
      return
    }
    const normalized = normalizeHyperlinkUrl(url)
    if (!normalized) {
      setError('Enter a valid http(s) URL')
      return
    }
    const cell = getActiveSheet().cells[cellId]
    const empty = cell == null || (cell.value == null && !cell.formula)
    pushHistory(cell?.hyperlink ? 'Edit link' : 'Insert link')
    if (empty) setCellValue(cellId, normalized)
    else setCellHyperlink(cellId, { url: normalized })
    onClose()
  }, [cellId, url, getActiveSheet, pushHistory, setCellValue, setCellHyperlink, onClose])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-start justify-center p-4 md:pt-[20vh]">
      <div className="absolute inset-0" style={{ background: 'oklch(0.1 0.02 250 / 0.4)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div
        ref={containerRef}
        className="relative rounded-t-2xl md:rounded-xl shadow-2xl border w-96 max-w-[calc(100vw-2rem)] p-4 animate-slide-up bg-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hyperlink-dialog-title"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface, white)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="hyperlink-dialog-title" className="text-sm font-semibold">
            {getActiveSheet().cells[cellId ?? '']?.hyperlink ? 'Edit Link' : 'Insert Link'}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <label className="block text-xs text-gray-500 mb-1" htmlFor="hyperlink-url">URL</label>
        <input
          id="hyperlink-url"
          ref={inputRef}
          className="w-full px-2.5 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
          placeholder="https://example.com"
        />
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100">Cancel</button>
          <button type="button" onClick={handleSubmit} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">OK</button>
        </div>
      </div>
    </div>
  )
}

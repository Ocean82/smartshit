import { useState, useEffect, useMemo } from 'react'
import { Globe, Copy, Check, AlertCircle, Loader2 } from 'lucide-react'
import type { WorkbookData, SheetData } from '@/types'
import { refToCell, cellToRef } from '@/engine/spreadsheet'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

interface SharedMeta {
  name: string
  permission: string
  sharedBy: string
  expiresAt: string | null
}

interface SharedViewProps {
  token: string
}

export function SharedView({ token }: SharedViewProps) {
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null)
  const [meta, setMeta] = useState<SharedMeta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/shared/${token}`, {
          signal: AbortSignal.timeout(15_000),
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          setError(body.error ?? `Failed to load (HTTP ${res.status})`)
          return
        }

        const json = (await res.json()) as { workbook: WorkbookData; meta: SharedMeta }
        setWorkbook(json.workbook)
        setMeta(json.meta)
        setActiveSheetId(json.workbook.activeSheetId || json.workbook.sheets[0]?.id || null)
      } catch {
        setError('Failed to load the shared workbook. Please check the URL and try again.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleMakeCopy = () => {
    if (!workbook) return
    // Store workbook in localStorage and navigate to the main app
    localStorage.setItem('smartsht-import-shared', JSON.stringify(workbook))
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-blue-700 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-sm">s!</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" />
            Loading shared workbook...
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center">
        <div className="max-w-sm mx-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Unable to load</h1>
          <p className="text-sm text-gray-600">{error}</p>
          <a
            href="/"
            className="inline-block mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Go to smartsh!t
          </a>
        </div>
      </div>
    )
  }

  if (!workbook || !meta) return null

  const activeSheet = workbook.sheets.find((s) => s.id === activeSheetId) ?? workbook.sheets[0]

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      {/* Banner */}
      <div className="h-12 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/smartsht-favicon.PNG" alt="smartsh!t" className="w-6 h-6 rounded-lg" />
          <span className="text-sm font-bold text-white tracking-tight">smartsh!t</span>
        </div>

        <div className="w-px h-5 bg-slate-600" />

        <span className="text-xs text-slate-300 truncate max-w-[200px]">{meta.name}</span>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700/60 text-[11px]">
          <Globe size={11} className="text-blue-400" />
          <span className="text-slate-300">
            Shared by {meta.sharedBy} · {meta.permission === 'edit' ? 'Can edit' : 'View only'}
          </span>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-slate-300 bg-slate-700/50 hover:bg-slate-600 transition-colors"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy link'}
        </button>

        <button
          type="button"
          onClick={handleMakeCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Make a copy
        </button>
      </div>

      {/* Sheet tabs */}
      {workbook.sheets.length > 1 && (
        <div className="h-8 bg-gray-50 border-b border-gray-200 flex items-center px-2 gap-1 overflow-x-auto">
          {workbook.sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              onClick={() => setActiveSheetId(sheet.id)}
              className={`px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                activeSheetId === sheet.id
                  ? 'bg-white border border-gray-200 text-gray-900 font-medium shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Read-only grid */}
      <div className="flex-1 overflow-auto">
        <ReadOnlyGrid sheet={activeSheet} />
      </div>

      {/* Footer */}
      <div className="h-6 bg-gray-50 border-t border-gray-200 flex items-center px-3 text-[10px] text-gray-500 gap-4">
        <span>{activeSheet.name}</span>
        <span className="text-gray-300">|</span>
        <span>{Object.keys(activeSheet.cells).filter((k) => activeSheet.cells[k]?.value != null).length} cells</span>
        <div className="flex-1" />
        <span className="text-gray-400">smartsh!t · shared view</span>
      </div>
    </div>
  )
}

// ─── Read-Only Grid ──────────────────────────────────────────────────────────

function ReadOnlyGrid({ sheet }: { sheet: SheetData }) {
  const { maxRow, maxCol, grid } = useMemo(() => {
    const cellIds = Object.keys(sheet.cells).filter((id) => sheet.cells[id]?.value != null || sheet.cells[id]?.formula)

    if (cellIds.length === 0) {
      return { maxRow: 10, maxCol: 5, grid: [] as string[][] }
    }

    let mR = 0
    let mC = 0
    for (const id of cellIds) {
      const ref = cellToRef(id)
      if (ref.row > mR) mR = ref.row
      if (ref.col > mC) mC = ref.col
    }

    // Build grid
    const g: string[][] = []
    for (let r = 0; r <= mR; r++) {
      const row: string[] = []
      for (let c = 0; c <= mC; c++) {
        const cellId = refToCell(r, c)
        const cell = sheet.cells[cellId]
        if (cell?.displayValue) {
          row.push(String(cell.displayValue))
        } else if (cell?.value != null) {
          row.push(String(cell.value))
        } else {
          row.push('')
        }
      }
      g.push(row)
    }

    return { maxRow: mR, maxCol: mC, grid: g }
  }, [sheet.cells])

  // Column headers (A, B, C...)
  const colHeaders = Array.from({ length: maxCol + 1 }, (_, i) => String.fromCharCode(65 + (i % 26)))

  return (
    <table className="border-collapse text-xs w-max min-w-full">
      <thead className="sticky top-0 z-10">
        <tr className="bg-gray-100">
          <th className="w-10 h-7 border border-gray-200 bg-gray-100 text-gray-400 font-normal text-center sticky left-0 z-20" />
          {colHeaders.map((col, i) => (
            <th
              key={i}
              className="h-7 min-w-[80px] border border-gray-200 bg-gray-100 text-gray-600 font-medium text-center px-2"
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((row, rowIdx) => (
          <tr key={rowIdx} className="hover:bg-blue-50/30">
            <td className="w-10 h-7 border border-gray-200 bg-gray-50 text-gray-400 text-center font-normal sticky left-0 z-10">
              {rowIdx + 1}
            </td>
            {row.map((cell, colIdx) => {
              const cellId = refToCell(rowIdx, colIdx)
              const cellData = sheet.cells[cellId]
              const fmt = cellData?.format

              const style: React.CSSProperties = {
                fontWeight: fmt?.bold ? 'bold' : undefined,
                fontStyle: fmt?.italic ? 'italic' : undefined,
                textDecoration: fmt?.underline ? 'underline' : undefined,
                color: fmt?.fontColor ?? undefined,
                backgroundColor: fmt?.bgColor ?? undefined,
                textAlign: fmt?.textAlign ?? 'left',
                fontSize: fmt?.fontSize ? `${fmt.fontSize}px` : undefined,
              }

              return (
                <td
                  key={colIdx}
                  className="h-7 min-w-[80px] border border-gray-200 px-2 py-0.5 truncate max-w-[200px]"
                  style={style}
                  title={cell}
                >
                  {cell}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

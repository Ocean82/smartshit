/**
 * InspectorPanelContent — Cell Inspector panel.
 *
 * Shows for the currently selected cell:
 * - Plain-English formula explanation
 * - Cell dependencies (precedents — what feeds into this cell)
 * - Cell dependents (what uses this cell's value)
 * - Any auditor findings related to this cell
 */

import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { cellToRef, refToCell, colToLetter } from '@/engine/spreadsheet'
import { explainFormula, describeCellValue } from '@/lib/formulaExplainer'
import { computeSheetInsights } from '@/ai/sheetInsights'
import { ArrowDownRight, ArrowUpLeft, AlertTriangle, Hash, Type, Search } from 'lucide-react'

export function InspectorPanelContent() {
  const { selection, getActiveSheet, getComputedValue, setSelection, setChatInput, sendMessage, setActivePanel } = useStore()
  const sheet = getActiveSheet()

  // Get the selected cell info
  const cellInfo = useMemo(() => {
    if (!selection) return null
    const row = selection.startRow
    const col = selection.startCol
    const cellId = refToCell(row, col)
    const cellData = sheet.cells[cellId]
    const computed = getComputedValue(row, col)
    const formula = cellData?.formula ?? null

    // Get headers for context
    const headers: string[] = []
    let maxCol = 0
    for (const id of Object.keys(sheet.cells)) {
      const ref = cellToRef(id)
      if (ref.col > maxCol) maxCol = ref.col
    }
    for (let c = 0; c <= maxCol; c++) {
      headers.push(getComputedValue(0, c))
    }

    return { cellId, row, col, cellData, computed, formula, headers }
  }, [selection, sheet.cells, getComputedValue])

  // Get precedents and dependents
  const dependencies = useMemo(() => {
    if (!cellInfo?.formula) return { precedents: [], dependents: [] }

    const formula = cellInfo.formula.startsWith('=') ? cellInfo.formula.slice(1) : cellInfo.formula

    // Extract cell references from the formula (precedents)
    const refs: string[] = []
    const rangeRe = /([A-Z]+)(\d+):([A-Z]+)(\d+)/g
    const cellRe = /([A-Z]+)(\d+)/g

    // First get ranges
    let match
    const rangeRefs = new Set<string>()
    while ((match = rangeRe.exec(formula)) !== null) {
      const startCol = match[1].charCodeAt(0) - 65
      const startRow = parseInt(match[2]) - 1
      const endCol = match[3].charCodeAt(0) - 65
      const endRow = parseInt(match[4]) - 1
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          rangeRefs.add(refToCell(r, c))
        }
      }
    }

    // Then get individual cell refs (skip those already in ranges)
    const cleanFormula = formula.replace(/([A-Z]+\d+):([A-Z]+\d+)/g, '')
    while ((match = cellRe.exec(cleanFormula)) !== null) {
      const col = match[1].charCodeAt(0) - 65
      const row = parseInt(match[2]) - 1
      refs.push(refToCell(row, col))
    }

    const precedents = [...new Set([...rangeRefs, ...refs])].slice(0, 20)

    // Find dependents — cells whose formulas reference our cell
    const ourCellId = cellInfo.cellId
    const dependents: string[] = []
    for (const [id, cell] of Object.entries(sheet.cells)) {
      if (id === ourCellId || !cell.formula) continue
      if (cell.formula.includes(ourCellId) || cell.formula.includes(colToLetter(cellInfo.col) + String(cellInfo.row + 1))) {
        dependents.push(id)
      }
    }

    return { precedents, dependents: dependents.slice(0, 20) }
  }, [cellInfo, sheet.cells])

  const handleNavigate = (cellId: string) => {
    const ref = cellToRef(cellId)
    setSelection({ startRow: ref.row, startCol: ref.col, endRow: ref.row, endCol: ref.col })
  }

  const handleAskAI = () => {
    if (!cellInfo) return
    const cellRef = `${colToLetter(cellInfo.col)}${cellInfo.row + 1}`
    setChatInput(`Explain the formula in cell ${cellRef}: ${cellInfo.formula}`)
    setActivePanel('chat')
    setTimeout(() => sendMessage(), 100)
  }

  if (!cellInfo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <Search size={32} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500 mb-1">Select a cell to inspect</p>
        <p className="text-xs text-gray-400">
          Click any cell in the spreadsheet to see its formula, dependencies, and explanation.
        </p>
      </div>
    )
  }

  const cellRef = `${colToLetter(cellInfo.col)}${cellInfo.row + 1}`
  const hasFormula = !!cellInfo.formula
  const explanation = hasFormula
    ? explainFormula(cellInfo.formula!, cellInfo.headers)
    : { explanation: describeCellValue(cellInfo.cellData?.value), confidence: 'high' as const }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Cell reference + value */}
      <div className="px-3 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-bold text-blue-700 font-mono">{cellRef}</span>
          {hasFormula && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">
              Formula
            </span>
          )}
          {!hasFormula && cellInfo.cellData?.value != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
              {typeof cellInfo.cellData.value === 'number' ? 'Number' : 'Text'}
            </span>
          )}
        </div>
        {hasFormula && (
          <div className="mt-1 px-2 py-1.5 bg-gray-900 rounded-md">
            <code className="text-xs text-green-300 font-mono">{cellInfo.formula}</code>
          </div>
        )}
        <div className="mt-1.5 text-xs text-gray-500">
          <span className="font-medium">Value:</span> {cellInfo.computed || '(empty)'}
        </div>
      </div>

      {/* Explanation */}
      <div className="px-3 py-3 border-b border-gray-100">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
          Explanation
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{explanation.explanation}</p>
        {explanation.confidence === 'low' && (
          <button
            type="button"
            onClick={handleAskAI}
            className="mt-2 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors"
          >
            Ask AI to explain this formula
          </button>
        )}
      </div>

      {/* Precedents (what feeds into this cell) */}
      {dependencies.precedents.length > 0 && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUpLeft size={12} className="text-emerald-600" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Feeds Into This Cell ({dependencies.precedents.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {dependencies.precedents.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavigate(id)}
                className="px-2 py-0.5 text-[11px] font-mono bg-emerald-50 text-emerald-700 rounded border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dependents (what uses this cell) */}
      {dependencies.dependents.length > 0 && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowDownRight size={12} className="text-blue-600" />
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Uses This Cell ({dependencies.dependents.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {dependencies.dependents.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => handleNavigate(id)}
                className="px-2 py-0.5 text-[11px] font-mono bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No dependencies for static values */}
      {!hasFormula && dependencies.dependents.length === 0 && (
        <div className="px-3 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <Hash size={12} className="text-gray-400" />
            <span className="text-xs text-gray-500">Static value — no formula dependencies</span>
          </div>
          {dependencies.dependents.length === 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Type size={12} className="text-gray-400" />
              <span className="text-xs text-gray-500">Not referenced by any other cell</span>
            </div>
          )}
        </div>
      )}

      {/* Header context */}
      {cellInfo.headers[cellInfo.col] && (
        <div className="px-3 py-3">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Column Context
          </div>
          <p className="text-xs text-gray-600">
            Column {colToLetter(cellInfo.col)} header: <span className="font-medium">"{cellInfo.headers[cellInfo.col]}"</span>
          </p>
        </div>
      )}
    </div>
  )
}

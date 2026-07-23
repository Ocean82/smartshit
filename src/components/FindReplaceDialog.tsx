import { useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { Search, Replace, X, ArrowDown, ArrowUp } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

interface MatchResult {
  cellId: string
  row: number
  col: number
  value: string
}

export function FindReplaceDialog({ isOpen, onClose }: Props) {
  const { getActiveSheet, getComputedValue, setCellValue, pushHistory, setSelection } = useStore()
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [wholeCell, setWholeCell] = useState(false)
  const [searchInFormulas, setSearchInFormulas] = useState(false)
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [currentMatch, setCurrentMatch] = useState(-1)
  const [replaceCount, setReplaceCount] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Reset when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setMatches([])
      setCurrentMatch(-1)
      setReplaceCount(null)
    }
  }, [isOpen])

  const doSearch = useCallback(() => {
    if (!findText.trim()) {
      setMatches([])
      setCurrentMatch(-1)
      return
    }

    const sheet = getActiveSheet()
    const results: MatchResult[] = []

    // Build the search pattern
    let pattern: RegExp
    try {
      if (useRegex) {
        pattern = new RegExp(findText, caseSensitive ? 'g' : 'gi')
      } else if (wholeCell) {
        const escaped = escapeRegex(findText)
        pattern = new RegExp(`^${escaped}$`, caseSensitive ? '' : 'i')
      } else {
        const escaped = escapeRegex(findText)
        pattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi')
      }
    } catch {
      // Invalid regex — show no results
      setMatches([])
      setCurrentMatch(-1)
      return
    }

    for (const [cellId, cellData] of Object.entries(sheet.cells)) {
      if (cellData.value === null && !cellData.formula) continue
      const ref = cellToRef(cellId)
      const displayValue = getComputedValue(ref.row, ref.col)
      const rawValue = String(cellData.value ?? '')
      const formulaValue = cellData.formula ?? ''

      // Determine what to search in
      const searchTargets: string[] = [rawValue, displayValue]
      if (searchInFormulas && formulaValue) {
        searchTargets.push(formulaValue)
      }

      const matched = searchTargets.some((target) => {
        pattern.lastIndex = 0 // Reset for global regexes
        return pattern.test(target)
      })

      if (matched) {
        results.push({ cellId, row: ref.row, col: ref.col, value: rawValue })
      }
    }

    // Sort by row then column
    results.sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
    setMatches(results)
    setCurrentMatch(results.length > 0 ? 0 : -1)
    setReplaceCount(null)

    if (results.length > 0) {
      navigateToMatch(results[0])
    }
  }, [findText, caseSensitive, useRegex, wholeCell, searchInFormulas, getActiveSheet, getComputedValue])

  const navigateToMatch = useCallback((match: MatchResult) => {
    setSelection({ startRow: match.row, startCol: match.col, endRow: match.row, endCol: match.col })
  }, [setSelection])

  const goToNext = useCallback(() => {
    if (matches.length === 0) return
    const next = (currentMatch + 1) % matches.length
    setCurrentMatch(next)
    navigateToMatch(matches[next])
  }, [matches, currentMatch, navigateToMatch])

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return
    const prev = (currentMatch - 1 + matches.length) % matches.length
    setCurrentMatch(prev)
    navigateToMatch(matches[prev])
  }, [matches, currentMatch, navigateToMatch])

  const handleReplaceCurrent = useCallback(() => {
    if (currentMatch < 0 || !matches[currentMatch]) return
    const match = matches[currentMatch]
    pushHistory('Find & Replace')

    const currentValue = String(match.value)
    let newValue: string
    if (useRegex) {
      try {
        const pattern = new RegExp(findText, caseSensitive ? '' : 'i')
        newValue = currentValue.replace(pattern, replaceText)
      } catch {
        newValue = currentValue
      }
    } else {
      newValue = caseSensitive
        ? currentValue.replace(findText, replaceText)
        : currentValue.replace(new RegExp(escapeRegex(findText), 'i'), replaceText)
    }

    setCellValue(match.cellId, newValue || null)
    setReplaceCount(1)

    // Re-run search to update matches
    setTimeout(doSearch, 50)
  }, [currentMatch, matches, findText, replaceText, caseSensitive, useRegex, pushHistory, setCellValue, doSearch])

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return
    pushHistory('Replace All')

    let count = 0
    for (const match of matches) {
      const currentValue = String(match.value)
      let regex: RegExp
      try {
        regex = useRegex
          ? new RegExp(findText, caseSensitive ? 'g' : 'gi')
          : new RegExp(escapeRegex(findText), caseSensitive ? 'g' : 'gi')
      } catch {
        continue
      }
      const newValue = currentValue.replace(regex, replaceText)
      if (newValue !== currentValue) {
        setCellValue(match.cellId, newValue || null)
        count++
      }
    }

    setReplaceCount(count)
    setTimeout(doSearch, 50)
  }, [matches, findText, replaceText, caseSensitive, useRegex, pushHistory, setCellValue, doSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (matches.length === 0) {
        doSearch()
      } else {
        goToNext()
      }
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="absolute top-2 right-4 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-[360px] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-700">
            {showReplace ? 'Find & Replace' : 'Find'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowReplace(!showReplace)}
            className={`p-1 rounded text-xs ${showReplace ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            title="Toggle Replace"
          >
            <Replace size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {/* Find input */}
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={findText}
            onChange={(e) => { setFindText(e.target.value); setReplaceCount(null) }}
            onKeyDown={handleKeyDown}
            placeholder="Find..."
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
          />
          <button onClick={goToPrev} disabled={matches.length === 0} className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30" title="Previous (Shift+Enter)">
            <ArrowUp size={14} />
          </button>
          <button onClick={goToNext} disabled={matches.length === 0} className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30" title="Next (Enter)">
            <ArrowDown size={14} />
          </button>
          <button onClick={doSearch} className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
            Find
          </button>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Replace with..."
              className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
            />
            <button
              onClick={handleReplaceCurrent}
              disabled={currentMatch < 0}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30"
            >
              Replace
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-30"
            >
              All
            </button>
          </div>
        )}

        {/* Options + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
              />
              Aa
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer" title="Use regular expressions">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
              />
              .*
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer" title="Match whole cell">
              <input
                type="checkbox"
                checked={wholeCell}
                onChange={(e) => setWholeCell(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
              />
              Cell
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer" title="Search in formulas">
              <input
                type="checkbox"
                checked={searchInFormulas}
                onChange={(e) => setSearchInFormulas(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
              />
              fx
            </label>
          </div>
          <span className="text-[11px] text-gray-400">
            {matches.length > 0
              ? `${currentMatch + 1} of ${matches.length}`
              : findText.trim()
                ? 'No matches'
                : ''}
            {replaceCount !== null && ` · ${replaceCount} replaced`}
          </span>
        </div>
      </div>
    </div>
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

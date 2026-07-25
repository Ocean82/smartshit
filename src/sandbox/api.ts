/**
 * Sandbox Execution Engine — Host API
 *
 * Functions exposed into the QuickJS sandbox that scripts can call.
 * These form the "spreadsheet SDK" available inside agent-generated scripts.
 */

import { refToCell, cellToRef, letterToCol, colToLetter } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'
import type { MutationCollector } from './types'
import { MAX_MUTATIONS, MAX_LOG_LINES } from './limits'

export interface HostAPIContext {
  sheet: SheetData
  getComputedValue: (row: number, col: number) => string
  mutations: MutationCollector
  /** Override the default max mutation limit. */
  maxMutations?: number
}

/**
 * Build the set of host functions to expose into the sandbox.
 * Each function captures the context and operates on the sheet snapshot.
 */
export function buildHostAPI(ctx: HostAPIContext) {
  const { sheet, getComputedValue, mutations, maxMutations: maxMut } = ctx
  const mutationLimit = maxMut ?? MAX_MUTATIONS

  // ─── Derived sheet dimensions ──────────────────────────────────────────────
  let maxRow = -1
  let maxCol = -1
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.row > maxRow) maxRow = ref.row
    if (ref.col > maxCol) maxCol = ref.col
  }
  const rowCount = maxRow + 1
  const colCount = maxCol + 1

  // ─── Read Operations ───────────────────────────────────────────────────────

  function getCell(ref: string): string | number | null {
    const normalized = ref.trim().toUpperCase()
    const parsed = cellToRef(normalized)
    const computed = getComputedValue(parsed.row, parsed.col)
    if (computed === '' || computed === undefined) return null
    const num = Number(computed)
    if (!isNaN(num) && computed.trim() !== '') return num
    return computed
  }

  function getRawCell(ref: string): { value: string | number | boolean | null; formula?: string } {
    const normalized = ref.trim().toUpperCase()
    const cell = sheet.cells[normalized]
    if (!cell) return { value: null }
    return { value: cell.value, formula: cell.formula }
  }

  function getRange(startRef: string, endRef: string): (string | number | null)[][] {
    const start = cellToRef(startRef.trim().toUpperCase())
    const end = cellToRef(endRef.trim().toUpperCase())
    const minRow = Math.min(start.row, end.row)
    const maxR = Math.max(start.row, end.row)
    const minCol = Math.min(start.col, end.col)
    const maxC = Math.max(start.col, end.col)

    const result: (string | number | null)[][] = []
    for (let r = minRow; r <= maxR; r++) {
      const row: (string | number | null)[] = []
      for (let c = minCol; c <= maxC; c++) {
        const computed = getComputedValue(r, c)
        if (computed === '' || computed === undefined) {
          row.push(null)
        } else {
          const num = Number(computed)
          row.push(!isNaN(num) && computed.trim() !== '' ? num : computed)
        }
      }
      result.push(row)
    }
    return result
  }

  function getHeaders(): string[] {
    const headers: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      headers.push(getComputedValue(0, c) || '')
    }
    return headers
  }

  function getRowCount(): number {
    return rowCount
  }

  function getColCount(): number {
    return colCount
  }

  function findCells(
    column: string,
    condition: 'empty' | 'notEmpty' | 'equals' | 'contains' | 'gt' | 'lt',
    value?: unknown,
  ): string[] {
    const colIdx = /^[A-Z]{1,3}$/i.test(column)
      ? letterToCol(column.toUpperCase())
      : resolveHeaderCol(column)
    if (colIdx === null || colIdx < 0) return []

    const matches: string[] = []
    for (let r = 0; r < rowCount; r++) {
      const computed = getComputedValue(r, colIdx)
      const cellRef = refToCell(r, colIdx)
      let match = false

      switch (condition) {
        case 'empty':
          match = computed === '' || computed === undefined
          break
        case 'notEmpty':
          match = computed !== '' && computed !== undefined
          break
        case 'equals':
          match = computed === String(value ?? '')
          break
        case 'contains':
          match = computed.toLowerCase().includes(String(value ?? '').toLowerCase())
          break
        case 'gt': {
          const num = parseFloat(computed.replace(/[$,]/g, ''))
          match = !isNaN(num) && num > Number(value)
          break
        }
        case 'lt': {
          const num = parseFloat(computed.replace(/[$,]/g, ''))
          match = !isNaN(num) && num < Number(value)
          break
        }
      }
      if (match) matches.push(cellRef)
    }
    return matches
  }

  // ─── Write Operations ──────────────────────────────────────────────────────

  function setCell(ref: string, value: string | number | boolean | null, formula?: string): void {
    checkMutationLimit()
    const normalized = ref.trim().toUpperCase()
    if (formula) {
      mutations.cellUpdates[normalized] = { value: null, formula }
    } else {
      mutations.cellUpdates[normalized] = { value }
    }
    mutations.mutationCount++
  }

  function setCells(updates: Record<string, { value: string | number | boolean | null; formula?: string }>): void {
    for (const [ref, update] of Object.entries(updates)) {
      checkMutationLimit()
      const normalized = ref.trim().toUpperCase()
      mutations.cellUpdates[normalized] = update
      mutations.mutationCount++
    }
  }

  function setFormat(ref: string, format: Record<string, unknown>): void {
    checkMutationLimit()
    const normalized = ref.trim().toUpperCase()
    const existing = mutations.formatUpdates[normalized] || {}
    mutations.formatUpdates[normalized] = { ...existing, ...format }
    mutations.mutationCount++
  }

  function deleteRow(row: number): void {
    checkMutationLimit()
    mutations.rowDeletions.push(row)
    mutations.mutationCount++
  }

  function insertRow(afterRow: number): void {
    checkMutationLimit()
    mutations.rowInsertions.push(afterRow)
    mutations.mutationCount++
  }

  // ─── Utility Functions ─────────────────────────────────────────────────────

  function colToIndex(letter: string): number {
    return letterToCol(letter.toUpperCase())
  }

  function indexToCol(index: number): string {
    return colToLetter(index)
  }

  function cellRefFn(row: number, col: number): string {
    return refToCell(row, col)
  }

  function parseRef(ref: string): { row: number; col: number } {
    return cellToRef(ref.trim().toUpperCase())
  }

  function log(message: string): void {
    if (mutations.logs.length < MAX_LOG_LINES) {
      mutations.logs.push(String(message))
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function checkMutationLimit(): void {
    if (mutations.mutationCount >= mutationLimit) {
      throw new Error(
        `Mutation limit reached (${mutationLimit} changes). ` +
        `Try operating on a smaller range.`
      )
    }
  }

  function resolveHeaderCol(name: string): number | null {
    const lowered = name.toLowerCase()
    for (let c = 0; c <= maxCol; c++) {
      if (getComputedValue(0, c).toLowerCase() === lowered) return c
    }
    return null
  }

  return {
    // Read
    getCell,
    getRawCell,
    getRange,
    getHeaders,
    getRowCount,
    getColCount,
    findCells,
    // Write
    setCell,
    setCells,
    setFormat,
    deleteRow,
    insertRow,
    // Utility
    colToIndex,
    indexToCol,
    cellRef: cellRefFn,
    parseRef,
    log,
  }
}

export type HostAPI = ReturnType<typeof buildHostAPI>

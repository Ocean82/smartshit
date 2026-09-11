/**
 * Pure plan for drag-move / drag-copy of a rectangular cell block.
 */
import type { CellData, Selection } from '@/types'
import { refToCell } from '@/engine/spreadsheet'
import { adjustFormulaRefs } from '@/lib/autofill'

export type RelocateMode = 'move' | 'copy'

/** ~4px border ring in content space; excludes fill-handle corner. */
export function hitSelectionBorder(args: {
  x: number
  y: number
  rect: { top: number; left: number; width: number; height: number }
  threshold?: number
  /** Bottom-right square excluded so the fill handle wins. */
  excludeCornerSize?: number
}): boolean {
  const threshold = args.threshold ?? 4
  const exclude = args.excludeCornerSize ?? 12
  const { top, left, width, height } = args.rect
  const right = left + width
  const bottom = top + height
  const { x, y } = args

  if (x < left - threshold || x > right + threshold || y < top - threshold || y > bottom + threshold)
    return false

  const nearLeft = Math.abs(x - left) <= threshold
  const nearRight = Math.abs(x - right) <= threshold
  const nearTop = Math.abs(y - top) <= threshold
  const nearBottom = Math.abs(y - bottom) <= threshold
  if (!(nearLeft || nearRight || nearTop || nearBottom)) return false

  // Stay on the ring: for left/right edges require y within vertical span; same for top/bottom.
  if ((nearLeft || nearRight) && (y < top - threshold || y > bottom + threshold)) return false
  if ((nearTop || nearBottom) && (x < left - threshold || x > right + threshold)) return false

  if (x >= right - exclude && y >= bottom - exclude) return false
  return true
}


export interface RelocateWrite {
  cellId: string
  data: CellData
}

export interface RelocatePlan {
  writes: RelocateWrite[]
  /** Source cell ids to clear after writes (move only; never clears a dest write id). */
  clears: string[]
  destSelection: Selection
}

export function buildRelocatePlan(args: {
  cells: Record<string, CellData>
  source: Selection
  destRow: number
  destCol: number
  mode: RelocateMode
}): RelocatePlan | null {
  const sr0 = Math.min(args.source.startRow, args.source.endRow)
  const sr1 = Math.max(args.source.startRow, args.source.endRow)
  const sc0 = Math.min(args.source.startCol, args.source.endCol)
  const sc1 = Math.max(args.source.startCol, args.source.endCol)

  if (args.destRow === sr0 && args.destCol === sc0) return null

  const deltaR = args.destRow - sr0
  const deltaC = args.destCol - sc0
  const writes: RelocateWrite[] = []
  const destIds = new Set<string>()

  for (let r = sr0; r <= sr1; r++) {
    for (let c = sc0; c <= sc1; c++) {
      const srcId = refToCell(r, c)
      const src = args.cells[srcId]
      const destId = refToCell(r + deltaR, c + deltaC)
      destIds.add(destId)
      if (!src) continue
      const data: CellData = { ...src }
      if (data.formula) data.formula = adjustFormulaRefs(data.formula, deltaR, deltaC)
      if (data.format) data.format = { ...data.format }
      writes.push({ cellId: destId, data })
    }
  }

  const clears: string[] = []
  if (args.mode === 'move') {
    for (let r = sr0; r <= sr1; r++) {
      for (let c = sc0; c <= sc1; c++) {
        const id = refToCell(r, c)
        if (!destIds.has(id)) clears.push(id)
      }
    }
  }

  return {
    writes,
    clears,
    destSelection: {
      startRow: args.destRow,
      startCol: args.destCol,
      endRow: args.destRow + (sr1 - sr0),
      endCol: args.destCol + (sc1 - sc0),
    },
  }
}

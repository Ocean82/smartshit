/**
 * Pure plan for paste-transpose of a clipboard cell block.
 */
import type { CellData, Selection } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { adjustFormulaRefs } from '@/lib/autofill'

export interface TransposePasteWrite {
  cellId: string
  value: CellData['value']
  formula?: string
  format?: CellData['format']
  hyperlink?: CellData['hyperlink']
}

export function buildTransposePasteWrites(args: {
  cells: Record<string, CellData>
  source: Selection
  destRow: number
  destCol: number
}): { writes: TransposePasteWrite[]; destIds: Set<string>; sourceRect: {
  minR: number; maxR: number; minC: number; maxC: number
} } {
  const minR = Math.min(args.source.startRow, args.source.endRow)
  const maxR = Math.max(args.source.startRow, args.source.endRow)
  const minC = Math.min(args.source.startCol, args.source.endCol)
  const maxC = Math.max(args.source.startCol, args.source.endCol)
  const writes: TransposePasteWrite[] = []
  const destIds = new Set<string>()

  for (const [cellId, cellData] of Object.entries(args.cells)) {
    const ref = cellToRef(cellId)
    const newR = args.destRow + (ref.col - minC)
    const newC = args.destCol + (ref.row - minR)
    if (newR < 0 || newC < 0) continue
    const newId = refToCell(newR, newC)
    destIds.add(newId)
    let formula = cellData.formula
    if (formula) {
      formula = adjustFormulaRefs(formula, newR - ref.row, newC - ref.col)
    }
    writes.push({
      cellId: newId,
      value: cellData.value,
      formula,
      format: cellData.format,
      hyperlink: cellData.hyperlink,
    })
  }

  return { writes, destIds, sourceRect: { minR, maxR, minC, maxC } }
}

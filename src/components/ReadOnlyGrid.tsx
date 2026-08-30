import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { SheetData } from '@/types'
import { refToCell, cellToRef } from '@/engine/spreadsheet'

/** Convert a zero-based column index to a spreadsheet label (A, B, ..., Z, AA, AB). */
export function columnLabel(index: number): string {
  let n = index + 1
  let label = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    label = String.fromCharCode(65 + rem) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}

/**
 * Lightweight read-only grid used for shared views and version previews.
 * Renders a plain HTML table — no editor/store dependency.
 */
export function ReadOnlyGrid({ sheet }: { sheet: SheetData }) {
  const { maxCol, grid } = useMemo(() => {
    const cellIds = Object.keys(sheet.cells).filter(
      (id) => sheet.cells[id]?.value != null || sheet.cells[id]?.formula,
    )

    if (cellIds.length === 0) {
      return { maxCol: 5, grid: [] as string[][] }
    }

    let mR = 0
    let mC = 0
    for (const id of cellIds) {
      const ref = cellToRef(id)
      if (ref.row > mR) mR = ref.row
      if (ref.col > mC) mC = ref.col
    }

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

    return { maxCol: mC, grid: g }
  }, [sheet.cells])

  const colHeaders = Array.from({ length: maxCol + 1 }, (_, i) => columnLabel(i))

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

              const style: CSSProperties = {
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
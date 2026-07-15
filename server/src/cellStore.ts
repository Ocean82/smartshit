/**
 * Cell Store — Syncs workbook data from S3 (JSON) into the Postgres EAV table.
 * Provides SQL query tools for the AI agent to access real spreadsheet data.
 */
import { query } from './db.js'

export interface CellRow {
  row_index: number
  col_index: number
  raw_value: string | null
  computed_value: string | null
  data_type: string
}

export interface SheetMeta {
  sheet_index: number
  name: string
  row_count: number
  col_count: number
  headers: string[]
}

/**
 * Sync a workbook's cell data into Postgres.
 * Called after upload/save. Replaces all cells for the workbook.
 */
export async function syncWorkbookCells(
  workbookId: string,
  sheets: Array<{
    name: string
    cells: Record<string, { value?: string | number | boolean | null; formula?: string }>
  }>,
): Promise<{ cellCount: number }> {
  // Clear existing cells for this workbook
  await query('DELETE FROM smartsht.cells WHERE workbook_id = $1', [workbookId])
  await query('DELETE FROM smartsht.sheet_meta WHERE workbook_id = $1', [workbookId])

  let totalCells = 0

  for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
    const sheet = sheets[sheetIdx]
    const cellEntries = Object.entries(sheet.cells)

    if (cellEntries.length === 0) continue

    // Parse cell IDs (e.g., "A1" → row 0, col 0)
    const rows: Array<[string, number, number, string | null, string | null, string]> = []
    let maxRow = 0
    let maxCol = 0

    for (const [cellId, cellData] of cellEntries) {
      const parsed = parseCellId(cellId)
      if (!parsed) continue

      const { row, col } = parsed
      maxRow = Math.max(maxRow, row)
      maxCol = Math.max(maxCol, col)

      const rawValue = cellData.formula
        ? cellData.formula
        : cellData.value != null ? String(cellData.value) : null

      const computedValue = cellData.value != null ? String(cellData.value) : null
      const dataType = detectDataType(cellData)

      rows.push([workbookId, row, col, rawValue, computedValue, dataType] as unknown as [string, number, number, string | null, string | null, string])
    }

    // Batch insert cells (chunks of 500 to avoid query size limits)
    const CHUNK_SIZE = 500
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE)
      const values: unknown[] = []
      const placeholders: string[] = []

      chunk.forEach((row, idx) => {
        const offset = idx * 7
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
        )
        values.push(workbookId, sheetIdx, row[1], row[2], row[3], row[4], row[5])
      })

      await query(
        `INSERT INTO smartsht.cells (workbook_id, sheet_index, row_index, col_index, raw_value, computed_value, data_type)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (workbook_id, sheet_index, row_index, col_index)
         DO UPDATE SET raw_value = EXCLUDED.raw_value, computed_value = EXCLUDED.computed_value, data_type = EXCLUDED.data_type, updated_at = NOW()`,
        values,
      )
    }

    totalCells += rows.length

    // Detect headers (first row values)
    const headers: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const headerCell = cellEntries.find(([cellId]) => {
        const p = parseCellId(cellId)
        return p && p.row === 0 && p.col === c
      })
      if (headerCell) {
        const val = headerCell[1].value
        headers.push(val != null ? String(val) : `Col ${colToLetter(c)}`)
      } else {
        headers.push(`Col ${colToLetter(c)}`)
      }
    }

    // Insert sheet metadata
    await query(
      `INSERT INTO smartsht.sheet_meta (workbook_id, sheet_index, name, row_count, col_count, headers)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workbook_id, sheet_index)
       DO UPDATE SET name = EXCLUDED.name, row_count = EXCLUDED.row_count, col_count = EXCLUDED.col_count, headers = EXCLUDED.headers, updated_at = NOW()`,
      [workbookId, sheetIdx, sheet.name, maxRow + 1, maxCol + 1, JSON.stringify(headers)],
    )
  }

  // Update sync status
  await query(
    `INSERT INTO smartsht.cell_sync (workbook_id, last_synced_at, cell_count)
     VALUES ($1, NOW(), $2)
     ON CONFLICT (workbook_id)
     DO UPDATE SET last_synced_at = NOW(), cell_count = EXCLUDED.cell_count`,
    [workbookId, totalCells],
  )

  return { cellCount: totalCells }
}

// ─── Query Tools (for AI Agent) ──────────────────────────────────────────────

/**
 * Get all cells with a specific value (for conditional formatting queries).
 */
export async function findCellsByValue(
  workbookId: string,
  sheetIndex: number,
  searchValue: string,
  matchType: 'exact' | 'contains' = 'contains',
): Promise<CellRow[]> {
  const condition = matchType === 'exact'
    ? 'computed_value = $3'
    : 'computed_value ILIKE $3'
  const param = matchType === 'exact' ? searchValue : `%${searchValue}%`

  const result = await query<CellRow>(
    `SELECT row_index, col_index, raw_value, computed_value, data_type
     FROM smartsht.cells
     WHERE workbook_id = $1 AND sheet_index = $2 AND ${condition}
     ORDER BY row_index, col_index`,
    [workbookId, sheetIndex, param],
  )
  return result.rows
}

/**
 * Aggregate a column (SUM, AVG, MIN, MAX, COUNT).
 */
export async function aggregateColumn(
  workbookId: string,
  sheetIndex: number,
  colIndex: number,
  operation: 'sum' | 'avg' | 'min' | 'max' | 'count',
): Promise<{ result: number | null; rowCount: number }> {
  const ops: Record<string, string> = {
    sum: 'SUM(computed_value::numeric)',
    avg: 'AVG(computed_value::numeric)',
    min: 'MIN(computed_value::numeric)',
    max: 'MAX(computed_value::numeric)',
    count: 'COUNT(*)',
  }

  const result = await query<{ result: string; row_count: string }>(
    `SELECT ${ops[operation]} as result, COUNT(*) as row_count
     FROM smartsht.cells
     WHERE workbook_id = $1 AND sheet_index = $2 AND col_index = $3 AND data_type = 'number'`,
    [workbookId, sheetIndex, colIndex],
  )

  const row = result.rows[0]
  return {
    result: row?.result ? parseFloat(row.result) : null,
    rowCount: parseInt(row?.row_count ?? '0', 10),
  }
}

/**
 * Get column data for analysis (all values in a column).
 */
export async function getColumnData(
  workbookId: string,
  sheetIndex: number,
  colIndex: number,
  limit = 1000,
): Promise<CellRow[]> {
  const result = await query<CellRow>(
    `SELECT row_index, col_index, raw_value, computed_value, data_type
     FROM smartsht.cells
     WHERE workbook_id = $1 AND sheet_index = $2 AND col_index = $3
     ORDER BY row_index
     LIMIT $4`,
    [workbookId, sheetIndex, colIndex, limit],
  )
  return result.rows
}

/**
 * Get sheet overview: headers + row count + column stats.
 */
export async function getSheetOverview(
  workbookId: string,
  sheetIndex: number,
): Promise<SheetMeta | null> {
  const result = await query<{ sheet_index: number; name: string; row_count: number; col_count: number; headers: string[] }>(
    `SELECT sheet_index, name, row_count, col_count, headers
     FROM smartsht.sheet_meta
     WHERE workbook_id = $1 AND sheet_index = $2`,
    [workbookId, sheetIndex],
  )
  if (result.rows.length === 0) return null
  const row = result.rows[0]
  return {
    sheet_index: row.sheet_index,
    name: row.name,
    row_count: row.row_count,
    col_count: row.col_count,
    headers: row.headers ?? [],
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCellId(cellId: string): { row: number; col: number } | null {
  const match = cellId.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  const col = match[1].split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const row = parseInt(match[2], 10) - 1
  return { row, col }
}

function colToLetter(col: number): string {
  let result = ''
  let c = col + 1
  while (c > 0) {
    result = String.fromCharCode(((c - 1) % 26) + 65) + result
    c = Math.floor((c - 1) / 26)
  }
  return result
}

function detectDataType(cell: { value?: string | number | boolean | null; formula?: string }): string {
  if (cell.formula) return 'formula'
  if (cell.value === null || cell.value === undefined) return 'empty'
  if (typeof cell.value === 'number') return 'number'
  if (typeof cell.value === 'boolean') return 'boolean'
  const str = String(cell.value)
  if (!isNaN(Number(str)) && str.trim() !== '') return 'number'
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return 'date'
  return 'string'
}

/**
 * Correct SheetJS's date guesses in CSV text, per column.
 *
 * SheetJS type-guesses CSV values and gets dates wrong three ways:
 * - "1-2" and "3/4" (sizes, scores, ratios) become dates in 2001
 * - times like "9:30" become day fractions
 * - day-first dates split: "15/01/2025" stays text while "04/07/2025"
 *   silently becomes April 7
 *
 * Fix: only a full date with a year becomes a date. The day/month order comes
 * from the column (a first part over 12 anywhere means day-first; a column
 * that has both is left as text). Anything else SheetJS turned into a date
 * goes back to the text the user wrote, which SheetJS keeps in `cell.w`.
 */
import * as XLSX from 'xlsx'

const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

/** Excel serial for a calendar date, or null if the date does not exist (e.g. 2/30). */
function toSerial(y: number, m: number, d: number): number | null {
  const ms = Date.UTC(y, m - 1, d)
  const back = new Date(ms)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null
  return (ms - EXCEL_EPOCH_MS) / 86_400_000
}

/** Two-digit years follow Excel: 00-29 are 2000s, 30-99 are 1900s. */
function fullYear(y: string): number {
  const n = Number(y)
  return y.length === 4 ? n : n + (n < 30 ? 2000 : 1900)
}

/** A plain number SheetJS parsed correctly: "1,200", "$5", "45%", "(30)". */
function isNumericText(text: string): boolean {
  const n = text.replace(/[\s,$€£¥%()]/g, '')
  return n !== '' && n !== '-' && Number.isFinite(Number(n))
}

export function normalizeCsvDates(ws: XLSX.WorkSheet | undefined): void {
  if (!ws?.['!ref']) return
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cells: Array<{ cell: XLSX.CellObject; text: string }> = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      const text = typeof cell?.w === 'string' ? cell.w : typeof cell?.v === 'string' ? cell.v : null
      if (cell && text !== null) cells.push({ cell, text: text.trim() })
    }

    let dayFirst = false
    let monthFirst = false
    for (const { text } of cells) {
      const m = SLASH_DATE.exec(text)
      if (!m) continue
      if (Number(m[1]) > 12) dayFirst = true
      if (Number(m[2]) > 12) monthFirst = true
    }
    const ambiguousColumn = dayFirst && monthFirst

    for (const { cell, text } of cells) {
      let serial: number | null = null
      let z = ''
      const iso = ISO_DATE.exec(text)
      const slash = ambiguousColumn ? null : SLASH_DATE.exec(text)
      if (iso) {
        serial = toSerial(Number(iso[1]), Number(iso[2]), Number(iso[3]))
        z = 'yyyy-mm-dd'
      } else if (slash) {
        const a = Number(slash[1])
        const b = Number(slash[2])
        const y = fullYear(slash[3])
        serial = dayFirst ? toSerial(y, b, a) : toSerial(y, a, b)
        z = dayFirst ? 'dd/mm/yyyy' : 'm/d/yyyy'
      }

      if (serial !== null) {
        cell.t = 'n'
        cell.v = serial
        cell.z = z
      } else if (cell.t === 'n' && !isNumericText(text)) {
        // SheetJS made a date or time out of text that is not a full date.
        cell.t = 's'
        cell.v = text
        delete cell.z
      }
    }
  }
}

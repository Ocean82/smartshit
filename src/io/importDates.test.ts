/**
 * Uploaded dates render as the user wrote them.
 *
 * Reproduced 2026-11-15: times rendered as 12/31/1969, "1-2" in a CSV became
 * 1/2/2001, day-first CSV dates were split between text and wrong US dates,
 * and some Excel formats dropped the year or the time. Each case goes through
 * the real importer and the grid's formatter.
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { importWorkbookFromFileWithMeta } from './xlsx'
import { formatCellValue } from '@/lib/formatUtils'

const fakeFile = (name: string, buffer: ArrayBuffer) =>
  ({ name, arrayBuffer: async () => buffer }) as unknown as File

async function rendered(name: string, buffer: ArrayBuffer): Promise<Record<string, string>> {
  const { workbook } = await importWorkbookFromFileWithMeta(fakeFile(name, buffer))
  const out: Record<string, string> = {}
  for (const [id, cell] of Object.entries(workbook.sheets[0].cells)) {
    out[id] = formatCellValue(cell.value ?? null, cell.format?.numberFormat)
  }
  return out
}

function xlsxWith(cells: Array<[number, string]>): ArrayBuffer {
  const ws: XLSX.WorkSheet = {}
  cells.forEach(([v, z], i) => { ws[`A${i + 1}`] = { t: 'n', v, z } })
  ws['!ref'] = `A1:A${cells.length}`
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, ws, 'Sheet1')
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const csv = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

// 45672 = 2025-01-15, 45853.75 = 2025-07-15 18:00
describe('xlsx date and time formats', () => {
  it('renders times as times, not 12/31/1969', async () => {
    const r = await rendered('t.xlsx', xlsxWith([[0.5, 'h:mm AM/PM'], [0.75, 'h:mm'], [0.5, 'h:mm:ss AM/PM']]))
    expect(r).toEqual({ A1: '12:00 PM', A2: '18:00', A3: '12:00:00 PM' })
  })

  it('keeps the time on a date-time, without a daylight-saving hour shift', async () => {
    // CI runs in UTC, which has no DST, so pin a DST zone: a July time used
    // to render an hour late (7:00 PM for 6:00 PM).
    const saved = process.env.TZ
    process.env.TZ = 'America/Chicago'
    try {
      const r = await rendered('dt.xlsx', xlsxWith([[45853.75, 'm/d/yyyy h:mm'], [45672.25, 'm/d/yyyy h:mm']]))
      expect(r).toEqual({ A1: '7/15/2025 6:00 PM', A2: '1/15/2025 6:00 AM' })
    } finally {
      if (saved === undefined) delete process.env.TZ
      else process.env.TZ = saved
    }
  })

  it("keeps the year and the file's field order", async () => {
    const r = await rendered('d.xlsx', xlsxWith([
      [45672, 'm/d/yyyy'],
      [45672, 'mm/dd/yyyy'],
      [45672, 'dd/mm/yyyy'],
      [45672, 'yyyy-mm-dd'],
      [45672, 'd-mmm-yy'],
      [45672, 'mmmm d, yyyy'],
      [45672, 'mmm-yy'],
      [45672, '[$-409]m/d/yy;@'],
    ]))
    expect(r).toEqual({
      A1: '1/15/2025',
      A2: '1/15/2025',
      A3: '15/01/2025',
      A4: '2025-01-15',
      A5: 'January 15, 2025',
      A6: 'January 15, 2025',
      A7: 'Jan 25',
      A8: '1/15/2025',
    })
  })
})

describe('csv dates', () => {
  it('leaves fractions, ranges and times as the text the user wrote', async () => {
    const r = await rendered('a.csv', csv('Size,Score,Time\n1-2,3/4,9:30\n'))
    expect([r.A2, r.B2, r.C2]).toEqual(['1-2', '3/4', '9:30'])
  })

  it('reads a day-first column consistently', async () => {
    const r = await rendered('eu.csv', csv('Date\n15/01/2025\n04/07/2025\n'))
    expect([r.A2, r.A3]).toEqual(['15/01/2025', '04/07/2025'])
    const { workbook } = await importWorkbookFromFileWithMeta(fakeFile('eu.csv', csv('Date\n15/01/2025\n04/07/2025\n')))
    expect(workbook.sheets[0].cells.A3.value).toBe(45842) // 4 July 2025, not 7 April
  })

  it('reads US and ISO dates as dates', async () => {
    const r = await rendered('us.csv', csv('Date,ISO,Short\n01/15/2025,2025-01-15,1/15/25\n'))
    expect([r.A2, r.B2, r.C2]).toEqual(['1/15/2025', '2025-01-15', '1/15/2025'])
  })

  it('leaves a column that mixes day-first and month-first as text', async () => {
    const r = await rendered('mix.csv', csv('Date\n15/01/2025\n01/15/2025\n'))
    expect([r.A2, r.A3]).toEqual(['15/01/2025', '01/15/2025'])
  })

  it('still parses plain numbers', async () => {
    const { workbook } = await importWorkbookFromFileWithMeta(fakeFile('n.csv', csv('Amount,Count\n1200.5,7\n')))
    expect(workbook.sheets[0].cells.A2.value).toBe(1200.5)
    expect(workbook.sheets[0].cells.B2.value).toBe(7)
  })
})

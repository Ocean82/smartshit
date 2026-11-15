/**
 * Golden/characterization tests for upstream formualizer issues that affect
 * imported workbooks (`docs/formualizer-gaps.md`).
 *
 * These pin the CURRENT behavior of the bundled engine so an upgrade cannot
 * silently change it. Where the engine disagrees with Excel, the assertion says
 * what Excel returns and why it matters for SmartSht; where the upstream issue
 * no longer reproduces, the assertion is a regression guard.
 *
 * Run: npx vitest run --config vitest.integration.config.ts src/engine/knownGaps.realengine.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Workbook, initializeWasm, type WorkbookApi } from '@ocean8219/formualizer'
import { computedValueToString } from './spreadsheet'

beforeAll(async () => {
  await initializeWasm()
})

function newSheet() {
  const wb = new Workbook()
  wb.addSheet('Sheet1')
  return wb
}

function value(wb: WorkbookApi, row: number, col: number) {
  return wb.evaluateCell('Sheet1', row, col)
}

function text(wb: WorkbookApi, row: number, col: number) {
  return String(value(wb, row, col))
}

describe('#312 — binary +/- on a date keeps a Date type (Excel keeps a serial)', () => {
  it('DATE()+n returns a Date object, not the Excel serial number', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=DATE(2023,1,15)')
    wb.setFormula('Sheet1', 1, 2, '=A1+30')
    wb.evaluateAll()

    // Excel: 45002 (the day serial for 2023-02-14). Divergence is upstream.
    expect(value(wb, 1, 2)).toBeInstanceOf(Date)
  })

  it('the Date leaks into the grid as #ERROR! via computedValueToString', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=DATE(2023,1,15)')
    wb.setFormula('Sheet1', 1, 2, '=A1+30')
    wb.evaluateAll()

    // computedValueToString maps non-error objects to '#ERROR!', so users see a
    // broken cell even though Excel's cached value looked fine at import.
    expect(computedValueToString(value(wb, 1, 2))).toBe('#ERROR!')
  })

  it('multiplication coerces to a number, so only +/- is affected', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=DATE(2023,1,15)')
    wb.setFormula('Sheet1', 1, 2, '=A1*2')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(44941 * 2)
  })

  it('date minus date still counts days correctly', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=DATE(2023,2,15)')
    wb.setFormula('Sheet1', 1, 2, '=DATE(2023,1,15)')
    wb.setFormula('Sheet1', 1, 3, '=A1-B1')
    wb.evaluateAll()

    expect(value(wb, 1, 3)).toBe(31)
  })

  it('coercing with VALUE() or *1 restores the Excel serial number', () => {
    // These are the workarounds the import warning suggests — verified here so
    // the advice never drifts from engine behaviour.
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 1, '=VALUE(DATE(2023,1,15))+30')
    wb.setFormula('Sheet1', 1, 2, '=DATE(2023,1,15)*1+30')
    wb.evaluateAll()

    expect(value(wb, 1, 1)).toBe(44971)
    expect(value(wb, 1, 2)).toBe(44971)
  })
})

describe('#283 — approximate lookups assume sorted data', () => {
  /** Deliberately unsorted: 1, 3, 2. */
  function unsorted() {
    const wb = newSheet()
    const rows: Array<[number, number]> = [
      [1, 10],
      [3, 30],
      [2, 20],
    ]
    rows.forEach(([key, val], i) => {
      wb.setValue('Sheet1', i + 1, 1, key)
      wb.setValue('Sheet1', i + 1, 2, val)
    })
    return wb
  }

  it('VLOOKUP approximate returns #N/A even for a key that is present', () => {
    const wb = unsorted()
    wb.setFormula('Sheet1', 1, 3, '=VLOOKUP(2, A1:B3, 2)')
    wb.evaluateAll()

    // Excel also assumes sortedness here, but returns 20 for this table rather
    // than #N/A. Either way the guard must be exact match.
    expect(text(wb, 1, 3)).toBe('#N/A')
  })

  it('VLOOKUP exact (FALSE) finds the key in unsorted data', () => {
    const wb = unsorted()
    wb.setFormula('Sheet1', 1, 3, '=VLOOKUP(2, A1:B3, 2, FALSE)')
    wb.evaluateAll()

    expect(value(wb, 1, 3)).toBe(20)
  })

  it('MATCH approximate returns #N/A on unsorted data', () => {
    const wb = unsorted()
    wb.setFormula('Sheet1', 1, 3, '=MATCH(2, A1:A3)')
    wb.evaluateAll()

    expect(text(wb, 1, 3)).toBe('#N/A')
  })

  it('approximate lookups work when the data really is sorted', () => {
    const wb = newSheet()
    ;[
      [10, 100],
      [20, 200],
      [30, 300],
    ].forEach(([key, val], i) => {
      wb.setValue('Sheet1', i + 1, 1, key)
      wb.setValue('Sheet1', i + 1, 2, val)
    })
    wb.setFormula('Sheet1', 1, 3, '=VLOOKUP(25, A1:B3, 2)')
    wb.evaluateAll()

    expect(value(wb, 1, 3)).toBe(200)
  })
})

describe('#295 — wildcard criteria: * and ? work, ~ escapes and SQL metacharacters do not', () => {
  it('COUNTIF "*" wildcard matches like Excel', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 'abc')
    wb.setValue('Sheet1', 2, 1, 'abd')
    wb.setValue('Sheet1', 3, 1, 'x')
    wb.setFormula('Sheet1', 1, 2, '=COUNTIF(A1:A3, "a*")')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(2)
  })

  it('COUNTIF "?" wildcard matches like Excel', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 'abc')
    wb.setValue('Sheet1', 2, 1, 'abbc')
    wb.setValue('Sheet1', 3, 1, 'axc')
    wb.setFormula('Sheet1', 1, 2, '=COUNTIF(A1:A3, "a?c")')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(2)
  })

  it('COUNTIF "~*" literal escape is not honored (Excel returns 1)', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 'a*')
    wb.setValue('Sheet1', 2, 1, 'abc')
    wb.setFormula('Sheet1', 1, 2, '=COUNTIF(A1:A2, "a~*")')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(0)
  })

  it('COUNTIF "_" is treated as a SQL single-char wildcard (Excel treats it literally)', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 'abc')
    wb.setValue('Sheet1', 2, 1, 'a_c')
    wb.setFormula('Sheet1', 1, 2, '=COUNTIF(A1:A2, "a_c")')
    wb.evaluateAll()

    // Excel: 1 (only the literal "a_c"). Engine matches both.
    expect(value(wb, 1, 2)).toBe(2)
  })

  it('COUNTIF "%" is treated as a SQL multi-char wildcard (Excel treats it literally)', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 'abc')
    wb.setValue('Sheet1', 2, 1, 'a%c')
    wb.setFormula('Sheet1', 1, 2, '=COUNTIF(A1:A2, "a%c")')
    wb.evaluateAll()

    // Excel: 1 (only the literal "a%c"). Engine matches both.
    expect(value(wb, 1, 2)).toBe(2)
  })
})

describe('#319 — MATCH exact does NOT coerce blanks to 0 on 0.9.3 (regression guard)', () => {
  it('MATCH(0) over blank rows returns #N/A like Excel', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 2, 1, 1)
    wb.setFormula('Sheet1', 1, 2, '=MATCH(0, A1:A3, 0)')
    wb.evaluateAll()

    expect(text(wb, 1, 2)).toBe('#N/A')
  })

  it('MATCH(0) still finds a real zero further down the range', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 6, 1, 0)
    wb.setFormula('Sheet1', 1, 2, '=MATCH(0, A1:A10, 0)')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(6)
  })
})

describe('#285 — COUNTBLANK over sparse ranges is correct on 0.9.3 (regression guard)', () => {
  it('counts never-written cells in a range', () => {
    const wb = newSheet()
    wb.setFormula('Sheet1', 1, 2, '=COUNTBLANK(A1:A10)')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(10)
  })

  it('counts blanks around a sparse value', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 5, 1, 'x')
    wb.setFormula('Sheet1', 1, 2, '=COUNTBLANK(A1:A10)')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(9)
  })

  it('counts formula results of "" as blank, like Excel', () => {
    const wb = newSheet()
    wb.setValue('Sheet1', 1, 1, 'x')
    wb.setFormula('Sheet1', 2, 1, '=IF(A1="x","","")')
    wb.setFormula('Sheet1', 1, 2, '=COUNTBLANK(A1:A3)')
    wb.evaluateAll()

    expect(value(wb, 1, 2)).toBe(2)
  })
})

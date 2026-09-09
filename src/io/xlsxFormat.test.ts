import { describe, expect, it } from 'vitest'
import { mapExcelVerticalAlign } from './xlsxFormat'

describe('mapExcelVerticalAlign', () => {
  it.each([
    ['top', 'top'],
    ['center', 'middle'],
    ['bottom', 'bottom'],
    [undefined, undefined],
  ] as Array<[string | undefined, string | undefined]>)('%s -> %s', (v, expected) => {
    expect(mapExcelVerticalAlign(v)).toBe(expected)
  })
})
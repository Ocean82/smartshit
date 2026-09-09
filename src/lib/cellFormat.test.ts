import { describe, expect, it } from 'vitest'
import {
  textDecorationStyle,
  verticalAlignToCSS,
  isWrapEnabled,
} from './cellFormat'
import type { CellFormat } from '@/types'

describe('textDecorationStyle', () => {
  it.each([
    [{}, ''],
    [{ underline: true }, 'underline'],
    [{ strikethrough: true }, 'line-through'],
    [{ underline: true, strikethrough: true }, 'underline line-through'],
    [{ underline: false, strikethrough: false }, ''],
    [{ underline: undefined, strikethrough: undefined }, ''],
  ] as Array<[Partial<CellFormat>, string]>)('maps %j -> %s', (fmt, expected) => {
    expect(textDecorationStyle(fmt)).toBe(expected)
  })
})

describe('verticalAlignToCSS', () => {
  it.each([
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
  ] as Array<[NonNullable<CellFormat['verticalAlign']>, string]>)('%s -> %s', (v, expected) => {
    expect(verticalAlignToCSS(v)).toBe(expected)
  })

  it('returns undefined when not set', () => {
    expect(verticalAlignToCSS(undefined)).toBeUndefined()
  })
})

describe('isWrapEnabled', () => {
  it.each([
    [{}, false],
    [{ textWrap: false }, false],
    [{ textWrap: true }, true],
  ] as Array<[Partial<CellFormat>, boolean]>)('maps %j -> %s', (fmt, expected) => {
    expect(isWrapEnabled(fmt)).toBe(expected)
  })
})
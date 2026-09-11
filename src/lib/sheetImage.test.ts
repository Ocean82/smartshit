import { describe, expect, it } from 'vitest'
import { defaultImageBox, DEFAULT_SHEET_IMAGE_WIDTH } from './sheetImage'

describe('defaultImageBox', () => {
  it('keeps small images as-is', () => {
    expect(defaultImageBox(100, 80)).toEqual({ width: 100, height: 80 })
  })

  it('scales down wide images', () => {
    const box = defaultImageBox(800, 400)
    expect(box.width).toBe(DEFAULT_SHEET_IMAGE_WIDTH)
    expect(box.height).toBe(140)
  })
})

import { describe, expect, it } from 'vitest'
import { clampChartBox, clampFixedPopup, defaultChartPosition, mergeChartLayout, resolveViewportBounds } from './chartLayout'

describe('clampChartBox', () => {
  it('shrinks a 400px chart to fit a phone-width overlay', () => {
    const box = clampChartBox(
      { x: 100, y: 100, width: 400, height: 300 },
      { width: 375, height: 500 },
    )
    expect(box.width).toBeLessThanOrEqual(375 - 16)
    expect(box.x + box.width).toBeLessThanOrEqual(375)
    expect(box.y + box.height).toBeLessThanOrEqual(500)
    expect(box.x).toBeGreaterThanOrEqual(8)
  })

  it('leaves a fitting desktop chart unchanged', () => {
    const input = { x: 100, y: 80, width: 400, height: 300 }
    expect(clampChartBox(input, { width: 1200, height: 800 })).toEqual(input)
  })

  it('returns the original box when bounds are unknown', () => {
    const input = { x: 100, y: 100, width: 400, height: 300 }
    expect(clampChartBox(input, { width: 0, height: 0 })).toEqual(input)
  })

  it('never exceeds the overlay even when the preferred min size does not fit', () => {
    const box = clampChartBox(
      { x: 100, y: 100, width: 400, height: 300 },
      { width: 100, height: 120 },
    )
    expect(box.width).toBeLessThanOrEqual(100)
    expect(box.height).toBeLessThanOrEqual(120)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(100)
    expect(box.y + box.height).toBeLessThanOrEqual(120)
  })
})

describe('defaultChartPosition', () => {
  it('fits the default size on a narrow overlay', () => {
    const box = defaultChartPosition({ width: 360, height: 420 })
    expect(box.width).toBeLessThanOrEqual(344)
    expect(box.x).toBe(8)
  })
})

describe('clampFixedPopup', () => {
  it('keeps a 360px formula list on-screen on a phone', () => {
    const frame = clampFixedPopup(
      { top: 400, left: 300 },
      { width: 360, height: 320 },
      { width: 375, height: 667 },
    )
    expect(frame.width).toBeLessThanOrEqual(375 - 16)
    expect(frame.left + frame.width).toBeLessThanOrEqual(375)
    expect(frame.top + frame.height).toBeLessThanOrEqual(667)
  })
})

describe('resolveViewportBounds', () => {
  it('prefers the visual viewport so a mobile keyboard does not push popups off-screen', () => {
    expect(resolveViewportBounds({ width: 390, height: 320 }, { width: 390, height: 844 })).toEqual({
      width: 390,
      height: 320,
    })
  })

  it('falls back to the layout viewport when visual viewport is missing', () => {
    expect(resolveViewportBounds(null, { width: 1280, height: 800 })).toEqual({
      width: 1280,
      height: 800,
    })
  })
})

describe('mergeChartLayout', () => {
  it('persists clamped size instead of only x/y', () => {
    const next = mergeChartLayout(
      { x: 100, y: 100, width: 400, height: 300 },
      { x: 8, y: 8, width: 359, height: 300 },
    )
    expect(next).toEqual({ x: 8, y: 8, width: 359, height: 300 })
  })

  it('keeps current size when only position is updated', () => {
    const current = { x: 10, y: 10, width: 400, height: 300 }
    expect(mergeChartLayout(current, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      width: 400,
      height: 300,
    })
  })
})

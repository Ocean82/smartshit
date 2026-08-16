import { describe, expect, it } from 'vitest'
import { computeAnchoredPanelFrame } from './AnchoredPanel'

describe('computeAnchoredPanelFrame', () => {
  it('places the panel below the anchor when there is room', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { top: 40, bottom: 60, left: 20, right: 90 },
      viewport: { width: 800, height: 600 },
      width: 200,
      height: 180,
    })
    expect(frame.top).toBe(64)
    expect(frame.left).toBe(20)
    expect(frame.width).toBe(200)
    expect(frame.height).toBe(180)
  })

  it('flips upward by clamping when the panel would overflow the bottom', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { top: 200, bottom: 220, left: 10, right: 80 },
      viewport: { width: 400, height: 260 },
      width: 200,
      height: 200,
    })
    expect(frame.top + frame.height).toBeLessThanOrEqual(260)
    expect(frame.top).toBeGreaterThanOrEqual(8)
  })

  it('aligns to the end of the anchor when requested', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { top: 10, bottom: 30, left: 500, right: 580 },
      viewport: { width: 800, height: 600 },
      width: 200,
      height: 100,
      align: 'end',
    })
    expect(frame.left).toBe(380)
  })
})

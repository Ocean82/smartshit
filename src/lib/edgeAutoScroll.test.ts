import { describe, expect, it } from 'vitest'
import { EDGE_MARGIN, MAX_STEP, edgeScrollStep } from './edgeAutoScroll'

describe('edgeScrollStep', () => {
  it('is 0 inside the span, away from the edges', () => {
    expect(edgeScrollStep(500, 100, 900)).toBe(0)
    expect(edgeScrollStep(100 + EDGE_MARGIN, 100, 900)).toBe(0)
    expect(edgeScrollStep(900 - EDGE_MARGIN, 100, 900)).toBe(0)
  })

  it('scrolls toward the near edge, faster further out, capped', () => {
    expect(edgeScrollStep(110, 100, 900)).toBeLessThan(0)
    expect(edgeScrollStep(890, 100, 900)).toBeGreaterThan(0)
    expect(edgeScrollStep(950, 100, 900)).toBeGreaterThan(edgeScrollStep(890, 100, 900))
    expect(edgeScrollStep(5000, 100, 900)).toBe(MAX_STEP)
    expect(edgeScrollStep(-5000, 100, 900)).toBe(-MAX_STEP)
  })
})

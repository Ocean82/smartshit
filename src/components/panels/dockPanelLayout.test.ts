import { describe, expect, it } from 'vitest'
import { resolveDockPanelFrame, spreadsheetChromeBottomPadding } from './dockPanelLayout'

const chatDef = { minWidth: 280, maxWidth: 500, defaultWidth: 360 }

describe('resolveDockPanelFrame', () => {
  it('uses the full viewport on mobile so the close control stays on-screen', () => {
    const frame = resolveDockPanelFrame(390, chatDef, 360)
    expect(frame.isMobile).toBe(true)
    expect(frame.width).toBe(390)
    expect(frame.minWidth).toBe(0)
    expect(frame.maxWidth).toBe(390)
  })

  it('keeps stored desktop width within min/max on large viewports', () => {
    const frame = resolveDockPanelFrame(1280, chatDef, 400)
    expect(frame.isMobile).toBe(false)
    expect(frame.width).toBe(400)
    expect(frame.minWidth).toBe(280)
  })
})

describe('spreadsheetChromeBottomPadding', () => {
  it('reserves the mobile toolbar so sheet tabs are not covered', () => {
    expect(spreadsheetChromeBottomPadding(390)).toBe(52)
    expect(spreadsheetChromeBottomPadding(1280)).toBe(0)
  })
})

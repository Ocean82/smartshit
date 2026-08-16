export interface ChartBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ChartBounds {
  width: number
  height: number
}

export const DEFAULT_CHART_SIZE = { width: 400, height: 300 } as const

/**
 * Keep a floating chart fully inside its overlay. Desktop sizes (400x300)
 * overflow a phone-width grid; clamp instead of clipping close/remove.
 * Size must never exceed the overlay, even if a preferred minimum would not fit.
 */
export function clampChartBox(
  box: ChartBox,
  bounds: ChartBounds,
  padding = 8,
): ChartBox {
  if (bounds.width <= 0 || bounds.height <= 0) return box

  const availableW = Math.max(0, bounds.width - padding * 2)
  const availableH = Math.max(0, bounds.height - padding * 2)
  const width = availableW > 0 ? Math.min(box.width, availableW) : bounds.width
  const height = availableH > 0 ? Math.min(box.height, availableH) : bounds.height
  const padX = availableW > 0 ? padding : 0
  const padY = availableH > 0 ? padding : 0
  const maxX = Math.max(padX, bounds.width - width - padX)
  const maxY = Math.max(padY, bounds.height - height - padY)

  return {
    width,
    height,
    x: Math.min(Math.max(box.x, padX), maxX),
    y: Math.min(Math.max(box.y, padY), maxY),
  }
}

export function clampFixedPopup(
  position: { top: number; left: number },
  size: { width: number; height: number },
  viewport: ChartBounds,
  padding = 8,
): { top: number; left: number; width: number; height: number } {
  const box = clampChartBox(
    { x: position.left, y: position.top, width: size.width, height: size.height },
    viewport,
    padding,
  )
  return { top: box.y, left: box.x, width: box.width, height: box.height }
}

export function resolveViewportBounds(
  visual: { width: number; height: number } | null | undefined,
  layout: ChartBounds,
): ChartBounds {
  if (visual && visual.width > 0 && visual.height > 0) {
    return { width: visual.width, height: visual.height }
  }
  return { width: layout.width, height: layout.height }
}

export function mergeChartLayout(
  current: ChartBox,
  next: { x: number; y: number; width?: number; height?: number },
): ChartBox {
  return {
    x: next.x,
    y: next.y,
    width: next.width ?? current.width,
    height: next.height ?? current.height,
  }
}

export function defaultChartPosition(bounds: ChartBounds): ChartBox {
  return clampChartBox(
    { x: 16, y: 16, width: DEFAULT_CHART_SIZE.width, height: DEFAULT_CHART_SIZE.height },
    bounds,
  )
}

export function getChartOverlayBounds(
  doc: Pick<Document, 'querySelector'> = document,
  win: {
    innerWidth: number
    innerHeight: number
    visualViewport?: { width: number; height: number } | null
  } = window,
): ChartBounds {
  const el = doc.querySelector('[data-spreadsheet-grid]') as HTMLElement | null
  if (el && el.clientWidth > 0 && el.clientHeight > 0) {
    return { width: el.clientWidth, height: el.clientHeight }
  }
  return resolveViewportBounds(win.visualViewport, {
    width: win.innerWidth,
    height: win.innerHeight,
  })
}

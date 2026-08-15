export const MOBILE_VIEWPORT_MAX_PX = 768

export interface DockSizeDef {
  minWidth: number
  maxWidth: number
  defaultWidth: number
}

export interface DockPanelFrame {
  isMobile: boolean
  width: number
  minWidth: number
  maxWidth: number
}

/**
 * Desktop docks keep a stored width. Mobile docks must fill the viewport so
 * header close controls are not clipped by minWidth > screen width.
 */
export function resolveDockPanelFrame(
  viewportWidth: number,
  def: DockSizeDef,
  storedWidth: number,
): DockPanelFrame {
  if (viewportWidth < MOBILE_VIEWPORT_MAX_PX) {
    return {
      isMobile: true,
      width: viewportWidth,
      minWidth: 0,
      maxWidth: viewportWidth,
    }
  }

  const reservedRail = 360
  const viewportMaxWidth = Math.max(0, viewportWidth - reservedRail)
  const effectiveMaxWidth = Math.max(def.minWidth, Math.min(def.maxWidth, viewportMaxWidth))
  const raw = Number.isFinite(storedWidth) ? storedWidth : def.defaultWidth
  const width = Math.min(effectiveMaxWidth, Math.max(def.minWidth, raw))

  return {
    isMobile: false,
    width,
    minWidth: def.minWidth,
    maxWidth: effectiveMaxWidth,
  }
}

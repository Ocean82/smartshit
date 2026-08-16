import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { clampFixedPopup, resolveViewportBounds, type ChartBounds } from '@/lib/chartLayout'

export interface AnchoredPanelProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  /** Preferred panel width before clamping */
  width?: number
  /** Preferred max height before clamping */
  maxHeight?: number
  /** Align panel to the start or end of the anchor */
  align?: 'start' | 'end'
  className?: string
  id?: string
  /** Accessible name when not labelled by the trigger */
  'aria-label'?: string
}

export interface AnchoredPanelFrame {
  top: number
  left: number
  width: number
  height: number
}

export function computeAnchoredPanelFrame(args: {
  anchor: { top: number; bottom: number; left: number; right: number }
  viewport: ChartBounds
  width: number
  height: number
  align?: 'start' | 'end'
  gap?: number
}): AnchoredPanelFrame {
  const { anchor, viewport, width, height, align = 'start', gap = 4 } = args
  const preferredLeft = align === 'end' ? anchor.right - width : anchor.left
  return clampFixedPopup(
    { top: anchor.bottom + gap, left: preferredLeft },
    { width, height },
    viewport,
  )
}

function measurePreferredHeight(el: HTMLElement | null, fallback: number): number {
  if (!el) return fallback
  const measured = el.scrollHeight
  return measured > 0 ? measured : fallback
}

/**
 * Viewport-clamped disclosure panel anchored to a trigger.
 * Uses fixed positioning (not absolute) so overflow:hidden ancestors cannot clip it.
 * Intentionally not role="menu" — callers should use plain buttons inside.
 */
export function AnchoredPanel({
  open,
  onClose,
  anchorRef,
  children,
  width = 220,
  maxHeight = 360,
  align = 'start',
  className = '',
  id,
  'aria-label': ariaLabel,
}: AnchoredPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState<AnchoredPanelFrame | null>(null)

  const reposition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const viewport = resolveViewportBounds(window.visualViewport, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    const preferredHeight = Math.min(
      maxHeight,
      measurePreferredHeight(panelRef.current, maxHeight),
    )

    setFrame(
      computeAnchoredPanelFrame({
        anchor: rect,
        viewport,
        width,
        height: preferredHeight,
        align,
      }),
    )
  }, [align, anchorRef, maxHeight, width])

  useLayoutEffect(() => {
    if (!open) {
      setFrame(null)
      return
    }
    reposition()
    const raf = requestAnimationFrame(reposition)
    return () => cancelAnimationFrame(raf)
  }, [open, reposition, children])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    const onViewportChange = () => reposition()

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('resize', onViewportChange)
    window.visualViewport?.addEventListener('scroll', onViewportChange)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', onViewportChange)
      window.visualViewport?.removeEventListener('resize', onViewportChange)
      window.visualViewport?.removeEventListener('scroll', onViewportChange)
    }
  }, [open, onClose, anchorRef, reposition])

  if (!open || !frame) return null

  return (
    <div
      ref={panelRef}
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={`fixed z-80 overflow-y-auto overscroll-contain ${className}`}
      style={{
        top: frame.top,
        left: frame.left,
        width: frame.width,
        maxHeight: frame.height,
      }}
    >
      {children}
    </div>
  )
}

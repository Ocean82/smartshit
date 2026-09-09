/**
 * FillHandle — the draggable 10px square at the bottom-right corner of the
 * selection. Pointer events are handled here; the drag itself is tracked by
 * SelectionManager via document-level pointermove/pointerup listeners.
 */
import type { PointerEvent } from 'react'

interface FillHandleProps {
  top: number
  left: number
  onPointerDown: (e: PointerEvent<HTMLElement>) => void
}

export function FillHandle({ top, left, onPointerDown }: FillHandleProps) {
  return (
    <div
      role="button"
      aria-label="Fill handle: drag to autofill"
      className="absolute z-30 cursor-crosshair"
      style={{
        top,
        left,
        width: 10,
        height: 10,
        boxSizing: 'border-box',
        backgroundColor: '#3B82F6',
        border: '1px solid #ffffff',
        boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.7)',
      }}
      onPointerDown={onPointerDown}
    />
  )
}
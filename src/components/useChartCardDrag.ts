import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { clampChartBox, type ChartBounds } from '@/lib/chartLayout'
import type { ChartConfig } from '@/types'

interface UseChartCardDragArgs {
  chartId: string
  position: ChartConfig['position']
  bounds: ChartBounds
}

function isPrimaryPointer(e: React.PointerEvent): boolean {
  return e.button === 0
}

function isRemoveButtonTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button'))
}

function shouldCancelMouseDrag(e: React.PointerEvent): boolean {
  return e.pointerType === 'mouse' && (e.buttons & 1) === 0
}

function releasePointerIfCaptured(e: React.PointerEvent<HTMLDivElement>): void {
  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
  e.currentTarget.releasePointerCapture(e.pointerId)
}

export function useChartCardDrag({ chartId, position, bounds }: UseChartCardDragArgs) {
  const { updateChartPosition } = useStore()
  const box = clampChartBox(
    { x: position.x, y: position.y, width: position.width, height: position.height },
    bounds,
  )
  const [pos, setPos] = useState({ x: box.x, y: box.y })
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const posRef = useRef(pos)
  posRef.current = pos
  const sizeRef = useRef({ width: box.width, height: box.height })
  sizeRef.current = { width: box.width, height: box.height }

  useEffect(() => {
    if (isDraggingRef.current) return
    const next = clampChartBox(
      { x: posRef.current.x, y: posRef.current.y, width: position.width, height: position.height },
      bounds,
    )
    setPos({ x: next.x, y: next.y })
    posRef.current = { x: next.x, y: next.y }
  }, [bounds.width, bounds.height, position.width, position.height])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    updateChartPosition(chartId, posRef.current.x, posRef.current.y, sizeRef.current)
    releasePointerIfCaptured(e)
  }, [chartId, updateChartPosition])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPrimaryPointer(e)) return
    if (isRemoveButtonTarget(e.target)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    isDraggingRef.current = true
    dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return
    if (shouldCancelMouseDrag(e)) {
      endDrag(e)
      return
    }
    const clamped = clampChartBox(
      {
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
      },
      bounds,
    )
    const newPos = { x: clamped.x, y: clamped.y }
    setPos(newPos)
    posRef.current = newPos
  }, [endDrag, bounds])

  useEffect(() => () => {
    isDraggingRef.current = false
  }, [])

  return { box, pos, handlePointerDown, handlePointerMove, endDrag }
}

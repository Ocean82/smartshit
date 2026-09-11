/**
 * Floating sheet images — move, resize, delete. Same overlay model as charts.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { clampChartBox, getChartOverlayBounds, type ChartBounds } from '@/lib/chartLayout'
import type { SheetImage } from '@/types'
import { defaultImageBox, readImageAsDataUrl } from '@/lib/sheetImage'
import { v4 as uuid } from 'uuid'

export function ImageOverlay() {
  const images = useStore((s) => s.getActiveSheet().images)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<ChartBounds>(() => getChartOverlayBounds())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setBounds({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [images?.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selectedId || useStore.getState().editingCell) return
      e.preventDefault()
      useStore.getState().pushHistory('Delete image')
      useStore.getState().removeImage(selectedId)
      setSelectedId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedId])

  // Paste image from clipboard when not editing.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (useStore.getState().editingCell) return
      const items = e.clipboardData?.items
      if (!items) return
      const file = [...items].find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (!file) return
      e.preventDefault()
      void insertImageFromBlob(file, bounds).catch((err) => {
        useStore.getState().showToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not paste image',
        })
      })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [bounds])

  if (!images || images.length === 0) {
    return <div ref={wrapRef} className="absolute inset-0 z-[19] overflow-hidden pointer-events-none" aria-hidden />
  }

  return (
    <div ref={wrapRef} className="absolute inset-0 z-[19] overflow-hidden pointer-events-none">
      {images.map((img) => (
        <ImageCard
          key={img.id}
          image={img}
          bounds={bounds}
          selected={selectedId === img.id}
          onSelect={() => setSelectedId(img.id)}
          onRemove={() => {
            useStore.getState().pushHistory('Delete image')
            useStore.getState().removeImage(img.id)
            if (selectedId === img.id) setSelectedId(null)
          }}
        />
      ))}
    </div>
  )
}

async function insertImageFromBlob(file: Blob, bounds: ChartBounds): Promise<void> {
  const src = await readImageAsDataUrl(file)
  const natural = await loadNaturalSize(src)
  const size = defaultImageBox(natural.width, natural.height)
  const box = clampChartBox(
    { x: 48, y: 48, width: size.width, height: size.height },
    bounds.width > 0 ? bounds : { width: 800, height: 600 },
  )
  useStore.getState().pushHistory('Insert image')
  useStore.getState().addImage({
    id: uuid(),
    src,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  })
}

function loadNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 280, height: 210 })
    img.src = src
  })
}

/** File-picker entry used by Insert → Image. */
export async function pickAndInsertSheetImage(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  document.body.appendChild(input)
  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
  document.body.removeChild(input)
  if (!file) return
  const bounds = getChartOverlayBounds()
  try {
    await insertImageFromBlob(file, bounds)
  } catch (err) {
    useStore.getState().showToast({
      type: 'error',
      message: err instanceof Error ? err.message : 'Could not insert image',
    })
  }
}

function ImageCard({
  image,
  bounds,
  selected,
  onSelect,
  onRemove,
}: {
  image: SheetImage
  bounds: ChartBounds
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const updateImagePosition = useStore((s) => s.updateImagePosition)
  const box = clampChartBox(
    { x: image.x, y: image.y, width: image.width, height: image.height },
    bounds,
  )
  const [pos, setPos] = useState({ x: box.x, y: box.y, w: box.width, h: box.height })
  const dragRef = useRef<{ mode: 'move' | 'resize'; ox: number; oy: number; sx: number; sy: number; sw: number; sh: number } | null>(null)
  const posRef = useRef(pos)
  posRef.current = pos

  useEffect(() => {
    if (dragRef.current) return
    const next = clampChartBox(
      { x: image.x, y: image.y, width: image.width, height: image.height },
      bounds,
    )
    setPos({ x: next.x, y: next.y, w: next.width, h: next.height })
  }, [image.x, image.y, image.width, image.height, bounds])

  const commit = useCallback(() => {
    updateImagePosition(image.id, posRef.current.x, posRef.current.y, {
      width: posRef.current.w,
      height: posRef.current.h,
    })
  }, [image.id, updateImagePosition])

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode,
      ox: e.clientX,
      oy: e.clientY,
      sx: pos.x,
      sy: pos.y,
      sw: pos.w,
      sh: pos.h,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      dragRef.current = null
      commit()
      return
    }
    const dx = e.clientX - d.ox
    const dy = e.clientY - d.oy
    if (d.mode === 'move') {
      const next = clampChartBox(
        { x: d.sx + dx, y: d.sy + dy, width: d.sw, height: d.sh },
        bounds,
      )
      setPos({ x: next.x, y: next.y, w: next.width, h: next.height })
    } else {
      const next = clampChartBox(
        {
          x: d.sx,
          y: d.sy,
          width: Math.max(48, d.sw + dx),
          height: Math.max(48, d.sh + dy),
        },
        bounds,
      )
      setPos({ x: next.x, y: next.y, w: next.width, h: next.height })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    commit()
  }

  return (
    <div
      className={`absolute pointer-events-auto touch-none group ${selected ? 'ring-2 ring-blue-500' : 'ring-1 ring-black/10'}`}
      style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
    >
      <img src={image.src} alt="" draggable={false} className="w-full h-full object-contain bg-white/80 select-none" />
      <button
        type="button"
        className="absolute top-1 right-1 p-1 rounded bg-white/90 text-gray-500 hover:text-red-600 shadow opacity-0 group-hover:opacity-100"
        aria-label="Remove image"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove() }}
      >
        <X size={14} />
      </button>
      <div
        className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-blue-500 cursor-se-resize"
        onPointerDown={(e) => onPointerDown(e, 'resize')}
      />
    </div>
  )
}

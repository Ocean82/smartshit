/**
 * Row/column visibility helpers (hide + display index lists).
 */

export type HiddenMap = Record<number, true>

export function isHidden(map: HiddenMap | undefined, index: number): boolean {
  return map != null && map[index] === true
}

export function setHidden(map: HiddenMap | undefined, indices: number[], hidden: boolean): HiddenMap {
  const next: HiddenMap = map ? { ...map } : {}
  for (const i of indices) {
    if (!Number.isFinite(i) || i < 0) continue
    const idx = Math.floor(i)
    if (hidden) next[idx] = true
    else delete next[idx]
  }
  return next
}

/** Contiguous hidden block immediately before or after `anchor`. */
export function adjacentHiddenBlock(
  map: HiddenMap | undefined,
  anchor: number,
  direction: 'before' | 'after',
): number[] {
  if (!map) return []
  const out: number[] = []
  if (direction === 'before') {
    for (let i = anchor - 1; i >= 0 && map[i]; i--) out.push(i)
    out.reverse()
  } else {
    for (let i = anchor + 1; map[i]; i++) out.push(i)
  }
  return out
}

/**
 * Display row indices after filter + hide.
 * Returns null when the mapping is identity (no filter, no hides).
 */
export function buildVisibleRowIndices(
  totalRows: number,
  filteredRows: number[] | null,
  hiddenRows?: HiddenMap,
): number[] | null {
  const hasHidden = hiddenRows != null && Object.keys(hiddenRows).length > 0
  if (!filteredRows && !hasHidden) return null

  const base = filteredRows ?? (() => {
    const all = new Array<number>(totalRows)
    for (let i = 0; i < totalRows; i++) all[i] = i
    return all
  })()

  if (!hasHidden) return base
  return base.filter((r) => !isHidden(hiddenRows, r))
}

/** Visible column indices, or null when identity. */
export function buildVisibleColIndices(totalCols: number, hiddenCols?: HiddenMap): number[] | null {
  const hasHidden = hiddenCols != null && Object.keys(hiddenCols).length > 0
  if (!hasHidden) return null
  const out: number[] = []
  for (let c = 0; c < totalCols; c++) {
    if (!isHidden(hiddenCols, c)) out.push(c)
  }
  return out
}

export function shiftHiddenOnInsert(map: HiddenMap | undefined, afterIndex: number): HiddenMap | undefined {
  if (!map || Object.keys(map).length === 0) return map
  const next: HiddenMap = {}
  for (const key of Object.keys(map)) {
    const i = Number(key)
    if (!Number.isFinite(i)) continue
    if (i > afterIndex) next[i + 1] = true
    else next[i] = true
  }
  return next
}

export function shiftHiddenOnDelete(map: HiddenMap | undefined, index: number): HiddenMap | undefined {
  if (!map || Object.keys(map).length === 0) return map
  const next: HiddenMap = {}
  for (const key of Object.keys(map)) {
    const i = Number(key)
    if (!Number.isFinite(i)) continue
    if (i === index) continue
    if (i > index) next[i - 1] = true
    else next[i] = true
  }
  return Object.keys(next).length > 0 ? next : undefined
}

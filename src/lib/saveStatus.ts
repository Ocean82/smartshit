import { useSyncExternalStore } from 'react'

/** Local autosave state. Kept outside the store: store writes would retrigger autosave. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

let status: SaveStatus = 'idle'
const listeners = new Set<() => void>()

export function setSaveStatus(next: SaveStatus) {
  if (next === status) return
  status = next
  listeners.forEach((l) => l())
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => status,
  )
}

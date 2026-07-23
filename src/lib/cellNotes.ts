/**
 * Cell Notes — lightweight annotation system for spreadsheet cells.
 *
 * Adapted from Univer's sheets-note model (Apache-2.0).
 * Allows users (and AI) to attach contextual notes to cells,
 * e.g., "Unexpected car repair" or "Bonus payment received".
 *
 * Persisted to localStorage alongside the workbook.
 */

import { v4 as uuid } from 'uuid'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CellNote {
  id: string
  /** Cell reference string, e.g., "B3". */
  cellId: string
  /** The note content. */
  text: string
  /** When the note was created. */
  createdAt: number
  /** When the note was last updated. */
  updatedAt: number
  /** Optional author name. */
  author?: string
  /** Whether the note popup is currently shown. */
  visible?: boolean
}

export type NoteMap = Record<string, CellNote>

// ─── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'smartsht:notes:'

function getStorageKey(sheetId: string): string {
  return `${STORAGE_KEY_PREFIX}${sheetId}`
}

// ─── Cell Notes Service ─────────────────────────────────────────────────────

export class CellNotesService {
  private _notes: Map<string, NoteMap> = new Map()
  private _listeners: Set<() => void> = new Set()

  constructor() {
    this._loadAll()
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  /** Get all notes for a sheet. */
  getNotesForSheet(sheetId: string): NoteMap {
    return this._notes.get(sheetId) ?? {}
  }

  /** Get a specific note by cell ID. */
  getNote(sheetId: string, cellId: string): CellNote | null {
    const sheetNotes = this._notes.get(sheetId)
    return sheetNotes?.[cellId] ?? null
  }

  /** Check if a cell has a note. */
  hasNote(sheetId: string, cellId: string): boolean {
    const sheetNotes = this._notes.get(sheetId)
    return !!sheetNotes?.[cellId]
  }

  /** Count notes in a sheet. */
  noteCount(sheetId: string): number {
    const sheetNotes = this._notes.get(sheetId)
    return sheetNotes ? Object.keys(sheetNotes).length : 0
  }

  /** Get all cell IDs that have notes in a sheet. */
  getNotedCellIds(sheetId: string): string[] {
    const sheetNotes = this._notes.get(sheetId)
    return sheetNotes ? Object.keys(sheetNotes) : []
  }

  // ─── Mutations ──────────────────────────────────────────────────────────

  /** Add or update a note on a cell. */
  setNote(sheetId: string, cellId: string, text: string, author?: string): CellNote {
    if (!this._notes.has(sheetId)) {
      this._notes.set(sheetId, {})
    }
    const sheetNotes = this._notes.get(sheetId)!
    const existing = sheetNotes[cellId]
    const now = Date.now()

    const note: CellNote = {
      id: existing?.id ?? uuid(),
      cellId,
      text,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      author: author ?? existing?.author,
      visible: existing?.visible,
    }

    sheetNotes[cellId] = note
    this._persist(sheetId)
    this._notify()
    return note
  }

  /** Remove a note from a cell. */
  removeNote(sheetId: string, cellId: string): boolean {
    const sheetNotes = this._notes.get(sheetId)
    if (!sheetNotes?.[cellId]) return false
    delete sheetNotes[cellId]
    this._persist(sheetId)
    this._notify()
    return true
  }

  /** Toggle note popup visibility. */
  toggleVisibility(sheetId: string, cellId: string): boolean {
    const sheetNotes = this._notes.get(sheetId)
    if (!sheetNotes?.[cellId]) return false
    sheetNotes[cellId].visible = !sheetNotes[cellId].visible
    this._persist(sheetId)
    this._notify()
    return true
  }

  /** Move a note when cells are reordered (e.g., after sort). */
  moveNote(sheetId: string, fromCellId: string, toCellId: string): boolean {
    const sheetNotes = this._notes.get(sheetId)
    if (!sheetNotes?.[fromCellId]) return false
    const note = sheetNotes[fromCellId]
    delete sheetNotes[fromCellId]
    note.cellId = toCellId
    note.updatedAt = Date.now()
    sheetNotes[toCellId] = note
    this._persist(sheetId)
    this._notify()
    return true
  }

  /** Clear all notes for a sheet. */
  clearSheet(sheetId: string): void {
    this._notes.delete(sheetId)
    this._removeFromStorage(sheetId)
    this._notify()
  }

  // ─── Subscription ───────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  private _notify(): void {
    for (const listener of this._listeners) listener()
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  private _loadAll(): void {
    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : null
      if (!storage) return
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith(STORAGE_KEY_PREFIX)) {
          const sheetId = key.slice(STORAGE_KEY_PREFIX.length)
          const raw = storage.getItem(key)
          if (raw) {
            this._notes.set(sheetId, JSON.parse(raw))
          }
        }
      }
    } catch { /* storage unavailable */ }
  }

  private _persist(sheetId: string): void {
    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : null
      if (!storage) return
      const notes = this._notes.get(sheetId)
      if (notes && Object.keys(notes).length > 0) {
        storage.setItem(getStorageKey(sheetId), JSON.stringify(notes))
      } else {
        storage.removeItem(getStorageKey(sheetId))
      }
    } catch { /* storage full */ }
  }

  private _removeFromStorage(sheetId: string): void {
    try {
      const storage = typeof localStorage !== 'undefined' ? localStorage : null
      storage?.removeItem(getStorageKey(sheetId))
    } catch { /* ignore */ }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: CellNotesService | null = null

export function getCellNotesService(): CellNotesService {
  if (!_instance) {
    _instance = new CellNotesService()
  }
  return _instance
}

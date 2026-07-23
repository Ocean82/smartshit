/**
 * Action Recorder & Replay — macro-style workflow recording.
 *
 * Adapted from Univer's action-recorder package (Apache-2.0).
 * Records user actions as serializable command sequences that can be
 * saved, replayed, and shared. Perfect for repeating monthly budget workflows.
 *
 * Architecture:
 * - Actions are recorded as simple JSON-serializable objects
 * - Each action captures: tool/command, parameters, timestamp
 * - Replay executes actions sequentially, optionally with delays
 * - Recordings can be saved to localStorage and exported as JSON
 */

import { v4 as uuid } from 'uuid'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecordedAction {
  /** Unique ID for this action instance. */
  id: string
  /** The action type/command name (e.g., 'setCellValue', 'sort', 'applyFormat'). */
  command: string
  /** Parameters for the action. */
  params: Record<string, unknown>
  /** Timestamp when the action was recorded (ms since epoch). */
  timestamp: number
  /** Human-readable description of what this action does. */
  description?: string
}

export interface ActionRecording {
  /** Unique recording ID. */
  id: string
  /** User-given name for this recording (e.g., "Monthly Budget Reconciliation"). */
  name: string
  /** When the recording was created. */
  createdAt: number
  /** When the recording was last replayed. */
  lastPlayedAt?: number
  /** Number of times this recording has been replayed. */
  playCount: number
  /** The ordered list of actions. */
  actions: RecordedAction[]
  /** Tags for organization. */
  tags?: string[]
}

export type RecorderState = 'idle' | 'recording' | 'replaying'

export interface ReplayOptions {
  /** Delay between actions in ms. 0 = instant. Default: 0. */
  delay?: number
  /** Whether to stop on first error. Default: true. */
  stopOnError?: boolean
  /** Callback invoked before each action. Return false to skip. */
  beforeAction?: (action: RecordedAction, index: number) => boolean | Promise<boolean>
  /** Callback invoked after each action completes. */
  afterAction?: (action: RecordedAction, index: number, success: boolean) => void
  /** Progress callback: (current, total). */
  onProgress?: (current: number, total: number) => void
}

export type ActionExecutor = (action: RecordedAction) => Promise<boolean> | boolean

// ─── Storage Keys ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'smartsht:recordings'

// ─── Action Recorder Service ────────────────────────────────────────────────

export class ActionRecorderService {
  private _state: RecorderState = 'idle'
  private _currentRecording: RecordedAction[] = []
  private _recordings: ActionRecording[] = []
  private _listeners: Set<() => void> = new Set()

  constructor() {
    this._loadFromStorage()
  }

  // ─── State ──────────────────────────────────────────────────────────────

  get state(): RecorderState {
    return this._state
  }

  get isRecording(): boolean {
    return this._state === 'recording'
  }

  get isReplaying(): boolean {
    return this._state === 'replaying'
  }

  get currentActionCount(): number {
    return this._currentRecording.length
  }

  get recordings(): readonly ActionRecording[] {
    return this._recordings
  }

  // ─── Recording ──────────────────────────────────────────────────────────

  startRecording(): void {
    if (this._state !== 'idle') return
    this._state = 'recording'
    this._currentRecording = []
    this._notify()
  }

  /**
   * Record a single action. Call this from your store/command handlers.
   */
  recordAction(command: string, params: Record<string, unknown>, description?: string): void {
    if (this._state !== 'recording') return

    const action: RecordedAction = {
      id: uuid(),
      command,
      params: structuredClone(params),
      timestamp: Date.now(),
      description,
    }

    this._currentRecording.push(action)
    this._notify()
  }

  /**
   * Stop recording and save the recording with the given name.
   * Returns the saved recording, or null if nothing was recorded.
   */
  stopRecording(name: string, tags?: string[]): ActionRecording | null {
    if (this._state !== 'recording') return null
    this._state = 'idle'

    if (this._currentRecording.length === 0) {
      this._notify()
      return null
    }

    const recording: ActionRecording = {
      id: uuid(),
      name,
      createdAt: Date.now(),
      playCount: 0,
      actions: [...this._currentRecording],
      tags,
    }

    this._recordings.push(recording)
    this._currentRecording = []
    this._saveToStorage()
    this._notify()
    return recording
  }

  /**
   * Discard the current recording without saving.
   */
  cancelRecording(): void {
    if (this._state !== 'recording') return
    this._state = 'idle'
    this._currentRecording = []
    this._notify()
  }

  // ─── Replay ─────────────────────────────────────────────────────────────

  /**
   * Replay a recording by executing each action through the provided executor.
   */
  async replay(
    recordingId: string,
    executor: ActionExecutor,
    options: ReplayOptions = {},
  ): Promise<{ success: boolean; completed: number; total: number }> {
    const recording = this._recordings.find((r) => r.id === recordingId)
    if (!recording) return { success: false, completed: 0, total: 0 }
    if (this._state !== 'idle') return { success: false, completed: 0, total: recording.actions.length }

    this._state = 'replaying'
    this._notify()

    const { delay = 0, stopOnError = true, beforeAction, afterAction, onProgress } = options
    const total = recording.actions.length
    let completed = 0

    try {
      for (let i = 0; i < total; i++) {
        const action = recording.actions[i]

        // Before hook
        if (beforeAction) {
          const proceed = await beforeAction(action, i)
          if (!proceed) {
            afterAction?.(action, i, false)
            if (stopOnError) break
            continue
          }
        }

        // Execute
        let success: boolean
        try {
          success = await executor(action)
        } catch {
          success = false
        }

        completed++
        afterAction?.(action, i, success)
        onProgress?.(completed, total)

        if (!success && stopOnError) break

        // Delay between actions
        if (delay > 0 && i < total - 1) {
          await sleep(delay)
        }
      }
    } finally {
      // Update play stats
      recording.lastPlayedAt = Date.now()
      recording.playCount++
      this._state = 'idle'
      this._saveToStorage()
      this._notify()
    }

    return { success: completed === total, completed, total }
  }

  // ─── Management ─────────────────────────────────────────────────────────

  deleteRecording(id: string): boolean {
    const index = this._recordings.findIndex((r) => r.id === id)
    if (index === -1) return false
    this._recordings.splice(index, 1)
    this._saveToStorage()
    this._notify()
    return true
  }

  renameRecording(id: string, newName: string): boolean {
    const recording = this._recordings.find((r) => r.id === id)
    if (!recording) return false
    recording.name = newName
    this._saveToStorage()
    this._notify()
    return true
  }

  /**
   * Export a recording as a JSON blob (for sharing/backup).
   */
  exportRecording(id: string): string | null {
    const recording = this._recordings.find((r) => r.id === id)
    if (!recording) return null
    return JSON.stringify(recording, null, 2)
  }

  /**
   * Import a recording from JSON.
   */
  importRecording(json: string): ActionRecording | null {
    try {
      const data = JSON.parse(json)
      if (!data.id || !data.name || !Array.isArray(data.actions)) return null

      // Assign a new ID to avoid conflicts
      const recording: ActionRecording = {
        ...data,
        id: uuid(),
        createdAt: data.createdAt ?? Date.now(),
        playCount: 0,
      }

      this._recordings.push(recording)
      this._saveToStorage()
      this._notify()
      return recording
    } catch {
      return null
    }
  }

  // ─── Subscription ───────────────────────────────────────────────────────

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }

  // ─── Persistence ────────────────────────────────────────────────────────

  private _loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        this._recordings = JSON.parse(raw)
      }
    } catch {
      this._recordings = []
    }
  }

  private _saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._recordings))
    } catch {
      // Storage full or unavailable — silently fail
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: ActionRecorderService | null = null

export function getActionRecorder(): ActionRecorderService {
  if (!_instance) {
    _instance = new ActionRecorderService()
  }
  return _instance
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * React hook for the Action Recorder service.
 * Provides reactive state binding for the macro recording/replay system.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  getActionRecorder,
  type ActionRecording,
  type RecorderState,
  type ReplayOptions,
  type ActionExecutor,
} from '@/lib/actionRecorder'

interface UseActionRecorderReturn {
  /** Current recorder state: idle | recording | replaying. */
  state: RecorderState
  /** Whether currently recording. */
  isRecording: boolean
  /** Whether currently replaying. */
  isReplaying: boolean
  /** Number of actions recorded in the current session. */
  currentActionCount: number
  /** All saved recordings. */
  recordings: readonly ActionRecording[]
  /** Start a new recording session. */
  startRecording: () => void
  /** Stop recording and save with the given name. */
  stopRecording: (name: string, tags?: string[]) => ActionRecording | null
  /** Cancel the current recording without saving. */
  cancelRecording: () => void
  /** Record a single action (call from store actions). */
  recordAction: (command: string, params: Record<string, unknown>, description?: string) => void
  /** Replay a saved recording. */
  replay: (recordingId: string, executor: ActionExecutor, options?: ReplayOptions) => Promise<{ success: boolean; completed: number; total: number }>
  /** Delete a saved recording. */
  deleteRecording: (id: string) => boolean
  /** Rename a saved recording. */
  renameRecording: (id: string, newName: string) => boolean
  /** Export a recording as JSON string. */
  exportRecording: (id: string) => string | null
  /** Import a recording from JSON string. */
  importRecording: (json: string) => ActionRecording | null
}

export function useActionRecorder(): UseActionRecorderReturn {
  const recorder = getActionRecorder()

  // Subscribe to recorder state changes
  const subscribe = useCallback((cb: () => void) => recorder.subscribe(cb), [recorder])
  const getSnapshot = useCallback(() => recorder.state, [recorder])

  const state = useSyncExternalStore(subscribe, getSnapshot)

  return {
    state,
    isRecording: state === 'recording',
    isReplaying: state === 'replaying',
    currentActionCount: recorder.currentActionCount,
    recordings: recorder.recordings,
    startRecording: () => recorder.startRecording(),
    stopRecording: (name, tags) => recorder.stopRecording(name, tags),
    cancelRecording: () => recorder.cancelRecording(),
    recordAction: (command, params, description) => recorder.recordAction(command, params, description),
    replay: (id, executor, options) => recorder.replay(id, executor, options),
    deleteRecording: (id) => recorder.deleteRecording(id),
    renameRecording: (id, newName) => recorder.renameRecording(id, newName),
    exportRecording: (id) => recorder.exportRecording(id),
    importRecording: (json) => recorder.importRecording(json),
  }
}

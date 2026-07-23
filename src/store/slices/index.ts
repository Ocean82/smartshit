/**
 * Store slices — modular state domains.
 *
 * Each slice defines its own state interface and action creators.
 * The main useStore composes these slices into a single Zustand store,
 * maintaining backward compatibility while enabling incremental migration.
 */

export { createUIState, createUIActions, type UIState, type UIActions } from './uiSlice'
export { createFileActions, type FileState, type FileActions } from './fileSlice'

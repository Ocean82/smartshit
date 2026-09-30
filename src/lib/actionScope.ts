/**
 * Action scope binding.
 *
 * A pending AgentAction is a *promise about a specific workbook state*: it was
 * prepared against one workbook, one sheet, one selection and one revision.
 * Applying it later — after a tab switch, a workbook import, an edit, or an app
 * reload — would write the right patch into the wrong place.
 *
 * Scope is captured locally when a proposal is created and re-validated at
 * Apply time. It is never accepted from model output (see
 * `shared/actionParams.ts`).
 */

import type { AgentAction, Selection } from '@/types'

/**
 * Session epoch. Generated once per page load so that actions restored from
 * persisted chat history are recognised as stale after a reload instead of
 * being applied against a freshly-hydrated workbook.
 */
export const ACTION_SCOPE_EPOCH: string =
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `epoch-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Locally trusted identity of the state a proposal was prepared against. */
export interface ActionScope {
  workbookId: string
  sheetId: string
  /** Monotonic workbook revision counter (see AppState.workbookRevision). */
  revision: number
  /** Selection captured at preparation time (null = nothing selected). */
  selection: Selection | null
  /** Page-load epoch — invalidates actions across reloads. */
  epoch: string
  /** Cheap content fingerprint of the target sheet. */
  sheetSignature: string
}

/** Minimal shape `captureActionScope` needs from the store. */
export interface ScopeSource {
  workbook: { id: string; sheets: Array<{ id: string; cells: Record<string, unknown> }> }
  activeSheetId: string
  selection: Selection | null
  workbookRevision: number
}

/**
 * Cheap, order-independent fingerprint of a sheet's cell content.
 *
 * `workbookRevision` already covers anything routed through `pushHistory`;
 * this catches direct engine writes that bypass the store's history path.
 */
export function computeSheetSignature(
  sheet: { cells: Record<string, unknown> } | undefined,
): string {
  if (!sheet) return 'missing'
  const ids = Object.keys(sheet.cells).sort()
  let hash = 2166136261
  let contentful = 0
  for (const id of ids) {
    const cell = sheet.cells[id] as
      | { value?: unknown; formula?: unknown; format?: unknown }
      | undefined
    if (cell == null) continue
    const piece = `${id}|${cell.formula ?? ''}|${String(cell.value ?? '')}|${cell.format ? 'f' : ''}`
    for (let i = 0; i < piece.length; i++) {
      hash ^= piece.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    contentful += 1
  }
  return `${ids.length}:${contentful}:${(hash >>> 0).toString(36)}`
}

/** Capture the scope a proposal must be bound to. */
export function captureActionScope(source: ScopeSource): ActionScope {
  const sheet = source.workbook.sheets.find((s) => s.id === source.activeSheetId)
  return {
    workbookId: source.workbook.id,
    sheetId: source.activeSheetId,
    revision: source.workbookRevision,
    selection: source.selection ? { ...source.selection } : null,
    epoch: ACTION_SCOPE_EPOCH,
    sheetSignature: computeSheetSignature(sheet),
  }
}

export type ScopeCheck = { ok: true } | { ok: false; reason: string }

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.startRow === b.startRow &&
    a.startCol === b.startCol &&
    a.endRow === b.endRow &&
    a.endCol === b.endCol
  )
}

/**
 * Validate that a proposal may still be applied against the current state.
 *
 * Unbound actions (no `scope`) are treated as legacy and allowed — every
 * production path now binds scope, so this only covers hand-built actions in
 * older tests.
 */
export function validateActionScope(action: AgentAction, current: ActionScope): ScopeCheck {
  const scope = action.scope
  if (!scope) return { ok: true }

  if (scope.epoch !== current.epoch) {
    return { ok: false, reason: 'the app was reloaded after the preview was made' }
  }
  if (scope.workbookId !== current.workbookId) {
    return { ok: false, reason: 'you switched to a different workbook after the preview was made' }
  }
  if (scope.sheetId !== current.sheetId) {
    return { ok: false, reason: 'you switched to a different sheet after the preview was made' }
  }
  if (!sameSelection(scope.selection, current.selection)) {
    return { ok: false, reason: 'your selection changed after the preview was made' }
  }
  if (scope.revision !== current.revision) {
    return { ok: false, reason: 'the sheet changed after the preview was made' }
  }
  if (scope.sheetSignature !== current.sheetSignature) {
    return { ok: false, reason: 'the sheet content changed after the preview was made' }
  }
  return { ok: true }
}

/** True when the action is bound and no longer matches the given scope. */
export function isActionStale(action: AgentAction, current: ActionScope): boolean {
  return !validateActionScope(action, current).ok
}

/** Ids of every pending action whose scope no longer matches `current`. */
export function collectStaleActionIds(
  messages: Array<{ actions?: AgentAction[] }>,
  current: ActionScope,
): Set<string> {
  const stale = new Set<string>()
  for (const message of messages) {
    for (const action of message.actions ?? []) {
      if (action.status !== 'pending') continue
      if (isActionStale(action, current)) stale.add(action.id)
    }
  }
  return stale
}

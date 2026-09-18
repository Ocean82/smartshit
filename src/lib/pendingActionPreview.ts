import type { AgentAction, CellChange, ChatMessage } from '@/types'

export interface PendingPreviewAction {
  action: AgentAction
  changes: CellChange[]
  changeByCell: Map<string, CellChange>
}

/**
 * The newest pending AgentAction that carries a non-empty preview.changes list,
 * or null. Returns the action object by reference so callers can subscribe to it
 * with Object.is equality.
 *
 * This is deliberately separate from findActivePendingPreview(): a pending action
 * reference is stable while a chat message streams (only the streaming message's
 * text mutates), so selecting the action rather than the whole `messages` array
 * lets the grid skip re-rendering on every streamed token.
 */
export function selectPendingPreviewAction(messages: ChatMessage[]): AgentAction | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg.actions?.length) continue
    for (const action of msg.actions) {
      if (action.status !== 'pending') continue
      if (action.preview?.changes?.length) return action
    }
  }
  return null
}

/** Build the cell-keyed preview view for a single pending action. */
export function buildPendingPreview(action: AgentAction | null): PendingPreviewAction | null {
  const changes = action?.preview?.changes
  if (!action || !changes?.length) return null
  const changeByCell = new Map<string, CellChange>()
  for (const change of changes) {
    changeByCell.set(change.cell.toUpperCase(), change)
  }
  return { action, changes, changeByCell }
}

/**
 * First pending AgentAction that carries a non-empty preview.changes list.
 * Used by the grid overlay and banner Approve/Reject.
 */
export function findActivePendingPreview(
  messages: ChatMessage[],
): PendingPreviewAction | null {
  return buildPendingPreview(selectPendingPreviewAction(messages))
}

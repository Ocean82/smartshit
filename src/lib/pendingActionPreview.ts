import type { AgentAction, CellChange, ChatMessage } from '@/types'

export interface PendingPreviewAction {
  action: AgentAction
  changes: CellChange[]
  changeByCell: Map<string, CellChange>
}

/**
 * First pending AgentAction that carries a non-empty preview.changes list.
 * Used by the grid overlay and banner Approve/Reject.
 */
export function findActivePendingPreview(
  messages: ChatMessage[],
): PendingPreviewAction | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg.actions?.length) continue
    for (const action of msg.actions) {
      if (action.status !== 'pending') continue
      const changes = action.preview?.changes
      if (!changes?.length) continue
      const changeByCell = new Map<string, CellChange>()
      for (const change of changes) {
        changeByCell.set(change.cell.toUpperCase(), change)
      }
      return { action, changes, changeByCell }
    }
  }
  return null
}

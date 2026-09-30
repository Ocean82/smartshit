import { v4 as uuid } from 'uuid'
import type { ActionScope, ChatMessage, Selection, WorkbookData } from '@/types'

// Zustand/Immer preserves a workbook object's identity until it is changed.
// Assign an O(1), session-local revision to that immutable snapshot instead of
// serializing/hashing a potentially large workbook for every approval.
const sessionId = uuid()
const revisions = new WeakMap<WorkbookData, number>()
let nextRevision = 0

function revisionOf(workbook: WorkbookData): number {
  let revision = revisions.get(workbook)
  if (revision === undefined) {
    revision = ++nextRevision
    revisions.set(workbook, revision)
  }
  return revision
}

export function captureActionScope(
  workbook: WorkbookData,
  sheetId: string,
  selection: Selection | null,
  additionalSelections: Selection[] = [],
): ActionScope {
  return {
    sessionId,
    workbookId: workbook.id,
    sheetId,
    revision: revisionOf(workbook),
    selectionKey: JSON.stringify([selection, additionalSelections]),
  }
}

export function actionScopeMatches(scope: ActionScope | undefined, current: ActionScope): boolean {
  return Boolean(scope
    && scope.sessionId === current.sessionId
    && scope.workbookId === current.workbookId
    && scope.sheetId === current.sheetId
    && scope.revision === current.revision
    && scope.selectionKey === current.selectionKey)
}

/** Only trusted client orchestration assigns scope; model output cannot. */
export function bindMessageActions(message: ChatMessage, scope: ActionScope): ChatMessage {
  return {
    ...message,
    actions: message.actions?.map(action => ({ ...action, scope })),
  }
}

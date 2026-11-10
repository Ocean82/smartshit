/**
 * Turn an auditor finding's fix writes into a pending, previewed AgentAction.
 *
 * The action carries a reviewed script patch, so it flows through the normal
 * pending-action path: the grid shows the proposed cells with the Apply/Reject
 * bar, nothing is written until Apply, and Apply commits exactly this patch as
 * one undo entry (see applyPreparedScriptAction).
 */

import { v4 as uuid } from 'uuid'
import type { AgentAction, CellChange, ChatMessage, SheetData } from '@/types'
import { getFixAbortReason } from '@/auditor'
import type { AuditFinding, AuditResult, FixWrite } from '@/auditor/types'
import { captureActionScope, type ScopeSource } from '@/lib/actionScope'
import { scriptPatchSignature, type ScriptPatch } from '@/lib/scriptPatch'

export function buildAuditFixAction(
  title: string,
  fixActions: FixWrite[],
  sheet: SheetData,
  scopeSource: ScopeSource,
): AgentAction | null {
  const cellUpdates: ScriptPatch['cellUpdates'] = {}
  const changes: CellChange[] = []

  for (const { cellId, formula, value } of fixActions) {
    const current = sheet.cells[cellId]
    if (formula) {
      const formulaStr = formula.startsWith('=') ? formula : `=${formula}`
      cellUpdates[cellId] = { value: null, formula: formulaStr }
      changes.push({
        cell: cellId,
        oldValue: current?.value ?? null,
        newValue: null,
        oldFormula: current?.formula,
        newFormula: formulaStr,
      })
    } else if (value !== undefined) {
      cellUpdates[cellId] = { value }
      changes.push({
        cell: cellId,
        oldValue: current?.value ?? null,
        newValue: value,
        oldFormula: current?.formula,
      })
    }
  }

  if (changes.length === 0) return null

  const patch: ScriptPatch = { cellUpdates, formatUpdates: {}, rowDeletions: [], rowInsertions: [] }
  return {
    id: uuid(),
    tool: 'execute_script',
    // `code` only satisfies the execute_script param contract; Apply commits
    // `prepared` and never runs it.
    params: { code: '// Auditor fix: reviewed patch, not re-executed' },
    description: `Auditor fix: ${title}`,
    status: 'pending',
    preview: { changes },
    // Bound to the target cells' content, not the selection or the whole-sheet
    // revision: unrelated edits, selection moves, and sibling fixes on other
    // cells leave it applicable; any change to its own cells makes it stale.
    scope: captureActionScope(scopeSource, { guardCells: Object.keys(cellUpdates) }),
    gate: 'autofix',
    prepared: { kind: 'script', patch, signature: scriptPatchSignature(patch) },
  }
}

/** Store slice `stageAuditFix` needs (the live store satisfies it). */
export interface AuditFixState extends ScopeSource {
  lastAuditResult: AuditResult | null
  lastAuditRevision: number | null
  addMessage: (message: ChatMessage) => void
}

export type StageResult = { ok: true } | { ok: false; message: string }

/**
 * The panel's APPLY FIX handler: check the finding still belongs to the latest
 * audit of the open sheet, then stage a pending preview action. Never writes
 * cells; the free auto-fix allowance is taken later, on Apply.
 */
export function stageAuditFix(finding: AuditFinding, state: AuditFixState): StageResult {
  const fixActions = finding.fixActions
  if (!fixActions?.length) return { ok: false, message: 'This finding has no automatic fix.' }

  // The fix was computed for the audited content. If the open sheet or the
  // workbook moved on since that audit, its writes could clobber newer work.
  const audit = state.lastAuditResult
  const fresh =
    audit?.sheetId === state.activeSheetId &&
    state.lastAuditRevision === state.workbookRevision &&
    audit.findings.some((f) => f.id === finding.id)
  if (!fresh) {
    return { ok: false, message: 'The sheet changed since this scan. Re-scan, then apply the fix again.' }
  }

  const sheet = state.workbook.sheets.find((s) => s.id === state.activeSheetId) as SheetData | undefined
  if (!sheet) return { ok: false, message: 'The sheet is no longer open.' }
  // Value writes must land in empty cells so a fix never silently overwrites data.
  const abort = getFixAbortReason(sheet, fixActions)
  if (abort) return { ok: false, message: abort }

  const action = buildAuditFixAction(finding.title, fixActions, sheet, state)
  if (!action) return { ok: false, message: 'This fix has nothing to change.' }
  state.addMessage({
    id: uuid(),
    role: 'assistant',
    content: `Auditor fix ready to review: ${finding.title}. Check the highlighted cells, then Apply or Reject.`,
    timestamp: Date.now(),
    actions: [action],
  })
  return { ok: true }
}

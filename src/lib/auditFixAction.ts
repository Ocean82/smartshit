/**
 * Turn an auditor finding's fix writes into a pending, previewed AgentAction.
 *
 * The action carries a reviewed script patch, so it flows through the normal
 * pending-action path: the grid shows the proposed cells with the Apply/Reject
 * bar, nothing is written until Apply, and Apply commits exactly this patch as
 * one undo entry (see applyPreparedScriptAction).
 */

import { v4 as uuid } from 'uuid'
import type { AgentAction, CellChange, SheetData } from '@/types'
import type { FixWrite } from '@/auditor/types'
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
    scope: captureActionScope(scopeSource),
    prepared: { kind: 'script', patch, signature: scriptPatchSignature(patch) },
  }
}

/**
 * Reviewed script patches.
 *
 * The sandbox dry-run used to produce a human-readable preview and then throw
 * the collected mutations away, so Apply re-ran the script against whatever the
 * sheet looked like *at that moment*. A single intervening edit meant the
 * applied values no longer matched the reviewed preview.
 *
 * `ScriptPatch` is the machine-readable form of the review: it is captured once
 * during the dry-run, shown to the user, fingerprinted, and committed verbatim
 * on Apply. The script is never re-executed.
 */

import type { CellFormat } from '@/types'
import type { SandboxSuccess } from '@/sandbox'

export interface ScriptPatch {
  cellUpdates: Record<string, { value: string | number | boolean | null; formula?: string }>
  formatUpdates: Record<string, Partial<CellFormat>>
  rowDeletions: number[]
  rowInsertions: number[]
}

/** Extract the exact mutation set a successful dry-run would commit. */
export function extractScriptPatch(result: SandboxSuccess): ScriptPatch {
  const cellUpdates: ScriptPatch['cellUpdates'] = {}
  for (const [cellId, update] of Object.entries(result.cellUpdates)) {
    cellUpdates[cellId] = { ...update }
  }
  const formatUpdates: ScriptPatch['formatUpdates'] = {}
  for (const [cellId, format] of Object.entries(result.formatUpdates)) {
    formatUpdates[cellId] = { ...format }
  }
  return {
    cellUpdates,
    formatUpdates,
    rowDeletions: [...result.rowDeletions],
    rowInsertions: [...result.rowInsertions],
  }
}

/** Total number of individual operations the patch performs. */
export function scriptPatchOperationCount(patch: ScriptPatch): number {
  return (
    Object.keys(patch.cellUpdates).length +
    Object.keys(patch.formatUpdates).length +
    patch.rowDeletions.length +
    patch.rowInsertions.length
  )
}

/** True when the patch would not change anything. */
export function isScriptPatchEmpty(patch: ScriptPatch): boolean {
  return scriptPatchOperationCount(patch) === 0
}

/**
 * Stable fingerprint of a patch, in canonical (sorted) key order.
 * Used to prove that Apply commits exactly the changes that were reviewed.
 */
export function scriptPatchSignature(patch: ScriptPatch): string {
  const cellPart = Object.keys(patch.cellUpdates)
    .sort()
    .map((id) => {
      const update = patch.cellUpdates[id]
      return `${id}=${update.formula ?? ''}:${String(update.value ?? '')}`
    })
    .join(',')
  const formatPart = Object.keys(patch.formatUpdates)
    .sort()
    .map((id) => `${id}=${JSON.stringify(patch.formatUpdates[id])}`)
    .join(',')
  const rowPart = `d[${[...patch.rowDeletions].sort((a, b) => a - b).join(',')}]i[${[...patch.rowInsertions].sort((a, b) => a - b).join(',')}]`
  return `cells{${cellPart}}formats{${formatPart}}rows${rowPart}`
}

/**
 * True when two patches describe the same set of operations.
 * Row ordering is normalised because the sandbox sorts deletions descending
 * for safe application while insertions keep source order.
 */
export function scriptPatchMatches(a: ScriptPatch, b: ScriptPatch): boolean {
  return scriptPatchSignature(a) === scriptPatchSignature(b)
}

/**
 * Reviewed script patches.
 *
 * Regression coverage for the reproduced defect: Apply re-ran the script against
 * whatever the sheet looked like at click time, so a preview computed with
 * `B2 = 10` could apply `B3 = 101` after B2 was edited to 100.
 */

import { describe, expect, it } from 'vitest'
import {
  extractScriptPatch,
  isScriptPatchEmpty,
  scriptPatchMatches,
  scriptPatchOperationCount,
  scriptPatchSignature,
  type ScriptPatch,
} from './scriptPatch'
import type { SandboxSuccess } from '@/sandbox'

function success(overrides: Partial<SandboxSuccess> = {}): SandboxSuccess {
  return {
    success: true,
    cellUpdates: {},
    formatUpdates: {},
    rowDeletions: [],
    rowInsertions: [],
    logs: [],
    summary: '',
    executionTime: 1,
    ...overrides,
  }
}

describe('extractScriptPatch', () => {
  it('copies every collected mutation out of the sandbox result', () => {
    const patch = extractScriptPatch(
      success({
        cellUpdates: { A1: { value: 1 }, B2: { value: null, formula: '=A1' } },
        formatUpdates: { A1: { bold: true } },
        rowDeletions: [4, 2],
        rowInsertions: [7],
      }),
    )
    expect(patch.cellUpdates).toEqual({ A1: { value: 1 }, B2: { value: null, formula: '=A1' } })
    expect(patch.formatUpdates).toEqual({ A1: { bold: true } })
    expect(patch.rowDeletions).toEqual([4, 2])
    expect(patch.rowInsertions).toEqual([7])
  })

  it('does not alias the sandbox result objects', () => {
    const result = success({ cellUpdates: { A1: { value: 1 } } })
    const patch = extractScriptPatch(result)
    patch.cellUpdates.A1.value = 999
    expect(result.cellUpdates.A1.value).toBe(1)
  })
})

describe('scriptPatchOperationCount / isScriptPatchEmpty', () => {
  it('counts every operation kind', () => {
    const patch: ScriptPatch = {
      cellUpdates: { A1: { value: 1 }, B2: { value: 2 } },
      formatUpdates: { A1: { bold: true } },
      rowDeletions: [3],
      rowInsertions: [9],
    }
    expect(scriptPatchOperationCount(patch)).toBe(5)
    expect(isScriptPatchEmpty(patch)).toBe(false)
  })

  it('treats a no-op dry-run as empty', () => {
    expect(isScriptPatchEmpty({ cellUpdates: {}, formatUpdates: {}, rowDeletions: [], rowInsertions: [] })).toBe(true)
  })
})

describe('scriptPatchSignature', () => {
  const patch: ScriptPatch = {
    cellUpdates: { B2: { value: 2 }, A1: { value: 1 } },
    formatUpdates: { A1: { bold: true } },
    rowDeletions: [4, 2],
    rowInsertions: [7],
  }

  it('is independent of key insertion order', () => {
    const reordered: ScriptPatch = {
      cellUpdates: { A1: { value: 1 }, B2: { value: 2 } },
      formatUpdates: { A1: { bold: true } },
      rowDeletions: [4, 2],
      rowInsertions: [7],
    }
    expect(scriptPatchSignature(patch)).toBe(scriptPatchSignature(reordered))
  })

  it('is independent of row ordering (deletions are sorted by the sandbox)', () => {
    const reordered: ScriptPatch = { ...patch, rowDeletions: [2, 4] }
    expect(scriptPatchSignature(patch)).toBe(scriptPatchSignature(reordered))
    expect(scriptPatchMatches(patch, reordered)).toBe(true)
  })

  it('changes when any reviewed value changes', () => {
    const changed: ScriptPatch = { ...patch, cellUpdates: { ...patch.cellUpdates, B2: { value: 101 } } }
    expect(scriptPatchSignature(patch)).not.toBe(scriptPatchSignature(changed))
    expect(scriptPatchMatches(patch, changed)).toBe(false)
  })

  it('changes when a format changes', () => {
    const changed: ScriptPatch = { ...patch, formatUpdates: { A1: { bold: false } } }
    expect(scriptPatchMatches(patch, changed)).toBe(false)
  })

  it('changes when a row operation changes', () => {
    expect(scriptPatchMatches(patch, { ...patch, rowInsertions: [8] })).toBe(false)
    expect(scriptPatchMatches(patch, { ...patch, rowDeletions: [4] })).toBe(false)
  })
})

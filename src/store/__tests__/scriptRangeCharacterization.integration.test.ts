/**
 * Characterization tests: the execute_script computed-range path, driven
 * end-to-end through the REAL store and REAL QuickJS sandbox (no mocks of the
 * code under test, no network, no live LLM).
 *
 * These lock in the current, verified behaviour of:
 *  1. a computed weighted-average (getRange → compute → setCell single result),
 *  2. a filter-into-a-new-range (getRange → filter predicate → setCell subset),
 *  3. atomic rollback when a prepared patch's signature no longer matches,
 *  4. the stale-proposal guard (sheet moved between preview and Apply).
 *
 * Harness (resetStore / seedData / injectScriptAction / storedAction /
 * waitForStatus / waitForPreview) is copied verbatim from the neighbouring
 * integration tests so the bootstrap, action shape and assertion idioms match:
 *  - src/store/__tests__/scriptActionApplyPatch.integration.test.ts
 *  - src/store/__tests__/scriptActionApprove.integration.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { captureActionScope } from '@/lib/actionScope'
import { scriptPatchSignature, type ScriptPatch } from '@/lib/scriptPatch'
import { applyPreparedScriptAction } from '../aiExecution'
import type { AgentAction } from '@/types'
import { v4 as uuid } from 'uuid'

function resetStore() {
  const wb = createEmptyWorkbook('Script Range Test')
  useStore.getState().engine.loadWorkbook(wb)
  useStore.setState({
    workbook: wb,
    activeSheetId: wb.sheets[0].id,
    selection: null,
    messages: [],
    undoStack: [],
    redoStack: [],
    chatInput: '',
    isAiProcessing: false,
  })
}

/**
 * Scenario 1 dataset: a price column (C) weighted by a weight column (D).
 * Weighted average = (10*1 + 20*2 + 30*3) / (1 + 2 + 3) = 140 / 6.
 */
function seedWeightedData() {
  const store = useStore.getState()
  store.setCellValue('C1', 'Price')
  store.setCellValue('C2', 10)
  store.setCellValue('C3', 20)
  store.setCellValue('C4', 30)
  store.setCellValue('D1', 'Weight')
  store.setCellValue('D2', 1)
  store.setCellValue('D3', 2)
  store.setCellValue('D4', 3)
}

/** Scenario 2 dataset: a Name/Status list, some rows open, some closed. */
function seedStatusList() {
  const store = useStore.getState()
  store.setCellValue('A1', 'Name')
  store.setCellValue('B1', 'Status')
  store.setCellValue('A2', 'Task1')
  store.setCellValue('B2', 'open')
  store.setCellValue('A3', 'Task2')
  store.setCellValue('B3', 'closed')
  store.setCellValue('A4', 'Task3')
  store.setCellValue('B4', 'open')
}

/** Inject a pending execute_script action the way the LLM gateway does. */
function injectScriptAction(code: string, extraParams: Record<string, unknown> = {}) {
  const state = useStore.getState()
  const scope = captureActionScope({
    workbook: state.workbook,
    activeSheetId: state.activeSheetId,
    selection: state.selection,
    workbookRevision: state.workbookRevision,
  })
  const action = {
    id: uuid(),
    tool: 'execute_script',
    params: { code, ...extraParams },
    description: 'Run script',
    status: 'pending' as const,
    scope,
  }
  useStore.setState((s) => ({
    messages: [
      ...s.messages,
      {
        id: uuid(),
        role: 'assistant' as const,
        content: 'Here is a script action.',
        timestamp: Date.now(),
        actions: [action],
      },
    ],
  }))
  return action.id
}

function storedAction(actionId: string) {
  return useStore
    .getState()
    .messages.flatMap((message) => message.actions ?? [])
    .find((candidate) => candidate.id === actionId)
}

async function waitForStatus(actionId: string, status: string) {
  await vi.waitFor(
    () => {
      expect(storedAction(actionId)?.status).toBe(status)
    },
    { timeout: 5000 },
  )
}

async function waitForPreview(actionId: string) {
  await vi.waitFor(
    () => {
      expect(storedAction(actionId)?.preview).toBeTruthy()
    },
    { timeout: 5000 },
  )
}

describe('execute_script — computed range characterization', () => {
  beforeEach(() => resetStore())

  // ── Scenario 1 ─────────────────────────────────────────────────────────────
  it('weighted average: previews exactly one computed cell, mutates nothing pre-Apply, then applies undoably', async () => {
    seedWeightedData()
    const expected = 140 / 6 // 23.3333…

    const actionId = injectScriptAction(
      `const vals = getRange("C2", "C4");
       const wts = getRange("D2", "D4");
       let num = 0, den = 0;
       for (let i = 0; i < vals.length; i++) {
         num += Number(vals[i][0]) * Number(wts[i][0]);
         den += Number(wts[i][0]);
       }
       setCell("F1", den === 0 ? 0 : num / den);`,
    )

    // First Apply: dry-run preview only.
    useStore.getState().applyAction(actionId)
    await waitForPreview(actionId)

    const changes = storedAction(actionId)?.preview?.changes
    expect(changes).toHaveLength(1)
    expect(changes?.[0].cell).toBe('F1')
    expect(Number(changes?.[0].newValue)).toBeCloseTo(expected, 6)

    // Preview must not mutate the sheet.
    expect(useStore.getState().getActiveSheet().cells['F1']).toBeUndefined()

    // Second Apply: commit the reviewed patch.
    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'applied')

    expect(Number(useStore.getState().getActiveSheet().cells['F1']?.value)).toBeCloseTo(expected, 6)

    // Exactly one undo entry for the whole script apply.
    expect(useStore.getState().undoStack).toHaveLength(1)

    // Undo restores prior state; redo re-applies.
    useStore.getState().undo()
    expect(useStore.getState().getActiveSheet().cells['F1']).toBeUndefined()

    useStore.getState().redo()
    expect(Number(useStore.getState().getActiveSheet().cells['F1']?.value)).toBeCloseTo(expected, 6)
  })

  // ── Scenario 2 ─────────────────────────────────────────────────────────────
  it('filter into a new range: previews exactly the written subset, applies atomically, undo/redo round-trips', async () => {
    seedStatusList()

    const actionId = injectScriptAction(
      `const rows = getRange("A2", "B4");
       let out = 1;
       for (let i = 0; i < rows.length; i++) {
         if (String(rows[i][1]) === "open") {
           setCell("E" + out, rows[i][0]);
           setCell("F" + out, rows[i][1]);
           out++;
         }
       }`,
    )

    // First Apply: dry-run preview only.
    useStore.getState().applyAction(actionId)
    await waitForPreview(actionId)

    const changes = storedAction(actionId)?.preview?.changes ?? []
    expect(changes).toHaveLength(4)

    // The preview is exactly the four open-row writes — nothing else.
    const written = new Map(changes.map((c) => [c.cell, c.newValue]))
    expect(written.get('E1')).toBe('Task1')
    expect(written.get('F1')).toBe('open')
    expect(written.get('E2')).toBe('Task3')
    expect(written.get('F2')).toBe('open')

    // Nothing mutated pre-Apply.
    expect(useStore.getState().getActiveSheet().cells['E1']).toBeUndefined()

    // Second Apply: atomic commit.
    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'applied')

    const cells = () => useStore.getState().getActiveSheet().cells
    expect(cells()['E1']?.value).toBe('Task1')
    expect(cells()['F1']?.value).toBe('open')
    expect(cells()['E2']?.value).toBe('Task3')
    expect(cells()['F2']?.value).toBe('open')
    // The closed row never leaked into the new range.
    expect(cells()['E3']).toBeUndefined()
    expect(cells()['F3']).toBeUndefined()

    // One undo entry; undo clears all four, redo restores all four.
    expect(useStore.getState().undoStack).toHaveLength(1)

    useStore.getState().undo()
    expect(cells()['E1']).toBeUndefined()
    expect(cells()['F1']).toBeUndefined()
    expect(cells()['E2']).toBeUndefined()
    expect(cells()['F2']).toBeUndefined()

    useStore.getState().redo()
    expect(cells()['E1']?.value).toBe('Task1')
    expect(cells()['F1']?.value).toBe('open')
    expect(cells()['E2']?.value).toBe('Task3')
    expect(cells()['F2']?.value).toBe('open')
  })

  // ── Scenario 3 ─────────────────────────────────────────────────────────────
  it('atomicity / rollback: a signature-mismatched patch writes NOTHING and leaves no dangling undo entry', async () => {
    seedStatusList()

    // A multi-cell patch whose signature does not describe the payload. This
    // drives the signature-verification branch of applyPreparedScriptAction,
    // which is the rollback guard: nothing is written.
    //
    // (The OTHER rollback message — the generic apply-time throw — is
    //  `The script changes could not be applied and were rolled back: ${detail}`.
    //  The signature guard below is the deterministic way to reproduce a clean
    //  rollback without a production hook to force a mid-apply throw.)
    const patch: ScriptPatch = {
      cellUpdates: { E1: { value: 'Task1' }, F1: { value: 'open' } },
      formatUpdates: {},
      rowDeletions: [],
      rowInsertions: [],
    }
    const action: AgentAction = {
      id: uuid(),
      tool: 'execute_script',
      params: { code: `setCell("E1", "Task1"); setCell("F1", "open");` },
      description: 'Run script',
      status: 'pending',
      prepared: { kind: 'script', patch, signature: 'not-the-reviewed-signature' },
    }

    const result = await applyPreparedScriptAction(
      action,
      () => useStore.getState() as never,
      ((fn: (s: unknown) => void) => useStore.setState(fn as never)) as never,
    )

    expect(result.success).toBe(false)
    // Verbatim production string:
    // "The reviewed changes no longer match this action. Ask me to regenerate it."
    expect(result.message).toMatch(/no longer match/i)

    // Sheet fully restored / untouched — no partial writes.
    expect(useStore.getState().getActiveSheet().cells['E1']).toBeUndefined()
    expect(useStore.getState().getActiveSheet().cells['F1']).toBeUndefined()

    // No dangling undo entry.
    expect(useStore.getState().undoStack).toHaveLength(0)
  })

  // ── Scenario 4 ─────────────────────────────────────────────────────────────
  // Characterization: a reviewed script patch is never applied to a sheet that
  // moved between preview and Apply — the scope guard rejects (status 'stale')
  // and the commit-time signature check is the backstop.
  it('stale-proposal guard (a): a preview is rejected as stale after the sheet moves between preview and Apply', async () => {
    seedWeightedData()

    const actionId = injectScriptAction(
      `const vals = getRange("C2", "C4");
       const wts = getRange("D2", "D4");
       let num = 0, den = 0;
       for (let i = 0; i < vals.length; i++) {
         num += Number(vals[i][0]) * Number(wts[i][0]);
         den += Number(wts[i][0]);
       }
       setCell("F1", den === 0 ? 0 : num / den);`,
    )

    // First Apply: dry-run preview only.
    useStore.getState().applyAction(actionId)
    await waitForStatus(actionId, 'pending')
    expect(storedAction(actionId)?.preview?.changes).toHaveLength(1)

    // Intervening edit moves the sheet after the review.
    useStore.getState().setCellValue('C2', 999)

    // Second Apply: the scope guard rejects instead of committing.
    useStore.getState().applyAction(actionId)
    expect(storedAction(actionId)?.status).toBe('stale')
    // Reviewed patch NOT applied to the moved sheet.
    expect(useStore.getState().getActiveSheet().cells['F1']).toBeUndefined()
  })

  it('stale-proposal guard (b): the commit-time signature check is the backstop when a patch is tampered after signing', async () => {
    seedWeightedData()

    // Sign a valid patch, THEN mutate the payload so the stored signature no
    // longer matches — the commit-time check is the defensive backstop.
    const patch: ScriptPatch = {
      cellUpdates: { F1: { value: 140 / 6 } },
      formatUpdates: {},
      rowDeletions: [],
      rowInsertions: [],
    }
    const signature = scriptPatchSignature(patch)
    patch.cellUpdates.F1 = { value: 9999 } // moved after signing

    const action: AgentAction = {
      id: uuid(),
      tool: 'execute_script',
      params: { code: `setCell("F1", 23.333);` },
      description: 'Run script',
      status: 'pending',
      prepared: { kind: 'script', patch, signature },
    }

    const result = await applyPreparedScriptAction(
      action,
      () => useStore.getState() as never,
      ((fn: (s: unknown) => void) => useStore.setState(fn as never)) as never,
    )

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/no longer match/i)
    expect(useStore.getState().getActiveSheet().cells['F1']).toBeUndefined()
    expect(useStore.getState().undoStack).toHaveLength(0)
  })
})

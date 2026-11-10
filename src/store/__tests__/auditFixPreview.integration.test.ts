/**
 * Auditor fixes go through the pending-action preview: staging one (via the
 * panel's APPLY FIX handler, `stageAuditFix`) must not mutate cells, Apply
 * commits exactly the reviewed writes as one undo entry, and Reject leaves the
 * sheet untouched. Also covers freshness (A1), allowance-on-Apply (A2),
 * selection independence (A3) and sibling fixes from one audit (A4).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { stageAuditFix } from '@/lib/auditFixAction'
import { setAutoFixReserver } from '@/lib/autoFixReserver'
import { selectPendingPreviewAction } from '@/lib/pendingActionPreview'
import type { AuditFinding, FixWrite } from '@/auditor/types'

function resetStore() {
  const wb = createEmptyWorkbook('Audit Fix Test')
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
    lastAuditResult: null,
    lastAuditRevision: null,
  })
}

let findingSeq = 0
function finding(fixActions: FixWrite[]): AuditFinding {
  return {
    id: `f${++findingSeq}`,
    ruleId: 'test',
    severity: 'high',
    title: 'Fix total',
    message: '',
    cells: [],
    autoFixable: true,
    fixActions,
  }
}

/** Record an audit of the current state containing `findings` (what the panel renders). */
function audit(...findings: AuditFinding[]) {
  const s = useStore.getState()
  useStore.setState({
    lastAuditResult: {
      timestamp: 0, durationMs: 0, sheetId: s.activeSheetId, sheetName: 'Sheet1',
      totalCells: 0, formulaCells: 0, findings, score: 50, summary: '',
    },
    lastAuditRevision: s.workbookRevision,
  })
}

/** Click APPLY FIX: stage via the panel's handler logic and return the new action id. */
function stage(f: AuditFinding): string {
  const before = new Set(allActions().map((a) => a.id))
  const result = stageAuditFix(f, useStore.getState())
  expect(result).toEqual({ ok: true })
  const added = allActions().filter((a) => !before.has(a.id))
  expect(added).toHaveLength(1)
  return added[0].id
}

const allActions = () => useStore.getState().messages.flatMap((m) => m.actions ?? [])
const stored = (id: string) => allActions().find((a) => a.id === id)
const cells = () => useStore.getState().getActiveSheet().cells

/** Bounded poll for an observable condition (no fixed sleeps). */
async function waitFor(cond: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

const settled = (id: string) => () => {
  const s = stored(id)?.status
  return s !== 'applying' && s !== 'previewing'
}

const TOTAL_FIX: FixWrite[] = [{ cellId: 'C1', formula: 'SUM(A1:B1)' }, { cellId: 'C2', value: 7 }]

describe('auditor fix goes through preview', () => {
  const reserve = vi.fn(async () => ({ allowed: true, used: 1, limit: 3 }))

  beforeEach(() => {
    resetStore()
    reserve.mockClear()
    reserve.mockImplementation(async () => ({ allowed: true, used: 1, limit: 3 }))
    setAutoFixReserver(reserve)
    useStore.getState().setCellValue('A1', 1)
    useStore.getState().setCellValue('B1', 2)
  })
  afterEach(() => setAutoFixReserver(null))

  it('staging previews the change without mutating cells', () => {
    const f = finding(TOTAL_FIX)
    audit(f)
    const id = stage(f)
    expect(cells()['C1']).toBeUndefined()
    expect(cells()['C2']).toBeUndefined()
    const pending = selectPendingPreviewAction(useStore.getState().messages)
    expect(pending?.id).toBe(id)
    expect(pending?.preview?.changes.map((c) => c.cell)).toEqual(['C1', 'C2'])
  })

  it('Apply commits the reviewed writes as a single undo entry', async () => {
    const f = finding(TOTAL_FIX)
    audit(f)
    const id = stage(f)
    const before = useStore.getState().undoStack.length
    useStore.getState().applyAction(id)
    await waitFor(settled(id))
    expect(stored(id)?.status).toBe('applied')
    expect(cells()['C1']?.formula).toBe('=SUM(A1:B1)')
    expect(cells()['C2']?.value).toBe(7)
    expect(useStore.getState().undoStack.length).toBe(before + 1)
    useStore.getState().undo()
    expect(cells()['C2']?.value ?? null).toBeNull()
  })

  it('Reject leaves the sheet untouched', () => {
    const f = finding(TOTAL_FIX)
    audit(f)
    const id = stage(f)
    useStore.getState().rejectAction(id)
    expect(stored(id)?.status).toBe('rejected')
    expect(cells()['C1']).toBeUndefined()
  })

  describe('A1: stale fixes never overwrite current work', () => {
    it('refuses to stage a finding once the workbook changed after the audit', () => {
      const f = finding([{ cellId: 'C1', formula: 'SUM(A1:B1)' }])
      audit(f)
      useStore.getState().setCellValue('C1', null, '=A1*2') // newer work after the scan
      const result = stageAuditFix(f, useStore.getState())
      expect(result.ok).toBe(false)
      expect(allActions()).toHaveLength(0)
      expect(cells()['C1']?.formula).toBe('=A1*2')
    })

    it('refuses to stage a finding audited on a different sheet', () => {
      const f = finding([{ cellId: 'C1', formula: 'SUM(A1:B1)' }])
      audit(f)
      useStore.setState({ activeSheetId: 'another-sheet' })
      expect(stageAuditFix(f, useStore.getState()).ok).toBe(false)
      expect(allActions()).toHaveLength(0)
    })

    it('refuses to stage a finding that is not in the latest audit', () => {
      const old = finding([{ cellId: 'C1', formula: 'SUM(A1:B1)' }])
      audit(finding([{ cellId: 'D1', value: 1 }]))
      expect(stageAuditFix(old, useStore.getState()).ok).toBe(false)
    })

    it('marks a staged fix stale when its target cell is edited before Apply', async () => {
      const f = finding([{ cellId: 'C1', formula: 'SUM(A1:B1)' }])
      audit(f)
      const id = stage(f)
      useStore.getState().setCellValue('C1', null, '=A1*2')
      useStore.getState().applyAction(id)
      await waitFor(settled(id))
      expect(stored(id)?.status).toBe('stale')
      expect(cells()['C1']?.formula).toBe('=A1*2')
      expect(reserve).not.toHaveBeenCalled()
    })
  })

  describe('A2: the free allowance is taken on Apply, not on staging', () => {
    it('staging and rejecting never reserve a fix', () => {
      const f = finding(TOTAL_FIX)
      audit(f)
      const id = stage(f)
      useStore.getState().rejectAction(id)
      expect(reserve).not.toHaveBeenCalled()
    })

    it('Apply reserves exactly once, even on a double click', async () => {
      const f = finding(TOTAL_FIX)
      audit(f)
      const id = stage(f)
      useStore.getState().applyAction(id)
      useStore.getState().applyAction(id)
      await waitFor(settled(id))
      expect(stored(id)?.status).toBe('applied')
      expect(reserve).toHaveBeenCalledTimes(1)
    })

    it('a denied reservation writes nothing and keeps the fix pending', async () => {
      reserve.mockImplementation(async () => ({ allowed: false, used: 3, limit: 3 }))
      const f = finding(TOTAL_FIX)
      audit(f)
      const id = stage(f)
      useStore.getState().applyAction(id)
      await waitFor(settled(id))
      expect(stored(id)?.status).toBe('pending')
      expect(cells()['C1']).toBeUndefined()
      expect(cells()['C2']).toBeUndefined()
    })

    it('a Reject while the reservation is in flight wins', async () => {
      let release!: () => void
      reserve.mockImplementation(() => new Promise((r) => { release = () => r({ allowed: true, used: 1, limit: 3 }) }))
      const f = finding(TOTAL_FIX)
      audit(f)
      const id = stage(f)
      useStore.getState().applyAction(id)
      useStore.getState().rejectAction(id)
      release()
      await waitFor(() => reserve.mock.results.length === 1)
      await new Promise((r) => setTimeout(r, 0))
      expect(stored(id)?.status).toBe('rejected')
      expect(cells()['C1']).toBeUndefined()
    })
  })

  it('A3: moving the selection after staging does not block Apply', async () => {
    const f = finding(TOTAL_FIX)
    audit(f)
    const id = stage(f)
    useStore.getState().setSelection({ startRow: 5, startCol: 5, endRow: 6, endCol: 6 })
    useStore.getState().applyAction(id)
    await waitFor(settled(id))
    expect(stored(id)?.status).toBe('applied')
    expect(cells()['C2']?.value).toBe(7)
  })

  describe('A4: several fixes staged from one audit', () => {
    it('applying one keeps disjoint siblings applicable', async () => {
      const first = finding([{ cellId: 'C1', formula: 'SUM(A1:B1)' }])
      const second = finding([{ cellId: 'D1', value: 9 }])
      audit(first, second)
      const a = stage(first)
      const b = stage(second)
      useStore.getState().applyAction(a)
      await waitFor(settled(a))
      useStore.getState().applyAction(b)
      await waitFor(settled(b))
      expect(stored(a)?.status).toBe('applied')
      expect(stored(b)?.status).toBe('applied')
      expect(cells()['C1']?.formula).toBe('=SUM(A1:B1)')
      expect(cells()['D1']?.value).toBe(9)
    })

    it('a sibling that targets a cell the first fix already wrote goes stale', async () => {
      const first = finding([{ cellId: 'C1', formula: 'SUM(A1:B1)' }])
      const overlapping = finding([{ cellId: 'C1', formula: 'A1+B1' }])
      audit(first, overlapping)
      const a = stage(first)
      const b = stage(overlapping)
      useStore.getState().applyAction(a)
      await waitFor(settled(a))
      useStore.getState().applyAction(b)
      await waitFor(settled(b))
      expect(stored(b)?.status).toBe('stale')
      expect(cells()['C1']?.formula).toBe('=SUM(A1:B1)')
    })
  })
})

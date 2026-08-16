import { describe, it, expect, vi } from 'vitest'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import {
  summarizeImportedSheets,
  applyWorkbookImportEffects,
  type ImportEffectAccess,
} from '../importOrchestration'

function makeAccess(
  wb: ReturnType<typeof createEmptyWorkbook>,
  extras?: Partial<ImportEffectAccess>,
): ImportEffectAccess {
  return {
    workbook: wb,
    activeSheetId: wb.activeSheetId,
    messages: [],
    activePanel: null,
    lastAuditResult: null,
    getActiveSheet: () => wb.sheets[0],
    getComputedValue: () => '',
    showToast: vi.fn(),
    setActivePanel: vi.fn(),
    ...extras,
  }
}

describe('importOrchestration', () => {
  it('summarizeImportedSheets counts rows from cell refs', () => {
    const wb = createEmptyWorkbook('T')
    wb.sheets[0].cells = {
      A1: { value: 'h' },
      A2: { value: 1 },
      A3: { value: 2 },
    }
    expect(summarizeImportedSheets(wb)).toEqual([{ name: wb.sheets[0].name, rows: 3 }])
  })

  it('applyWorkbookImportEffects pushes a chat message', () => {
    const wb = createEmptyWorkbook('Budget')
    wb.sheets[0].cells = { A1: { value: 'x' } }
    const access = makeAccess(wb)
    applyWorkbookImportEffects(
      (fn) => { fn(access) },
      () => access,
      wb,
      { fileName: 'budget.xlsx' },
    )
    expect(access.messages).toHaveLength(1)
    expect(access.messages[0].content).toContain('budget.xlsx')
  })

  it('stays on the sheet and toasts instead of opening insights', () => {
    vi.useFakeTimers()
    const wb = createEmptyWorkbook('Big')
    const cells: Record<string, { value: number }> = {}
    for (let r = 0; r < 8; r++) cells[`A${r + 1}`] = { value: r }
    wb.sheets[0].cells = cells

    const access = makeAccess(wb)
    applyWorkbookImportEffects(
      (fn) => { fn(access) },
      () => access,
      wb,
      { fileName: 'big.xlsx' },
    )
    expect(access.activePanel).toBeNull()
    expect(access.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        action: expect.objectContaining({ label: 'View Insights' }),
      }),
    )
    vi.useRealTimers()
  })

  it('drops a stale delayed audit after a newer import', () => {
    vi.useFakeTimers()
    function makeBig(name: string) {
      const wb = createEmptyWorkbook(name)
      const cells: Record<string, { value: number }> = {}
      for (let r = 0; r < 8; r++) cells[`A${r + 1}`] = { value: r }
      wb.sheets[0].cells = cells
      return wb
    }
    const seen: string[] = []
    const first = makeBig('First')
    const second = makeBig('Second')
    const access1 = makeAccess(first, {
      getActiveSheet: () => {
        seen.push('first')
        return first.sheets[0]
      },
    })
    applyWorkbookImportEffects((fn) => { fn(access1) }, () => access1, first, { fileName: 'a.xlsx' })
    const access2 = makeAccess(second, {
      getActiveSheet: () => {
        seen.push('second')
        return second.sheets[0]
      },
    })
    applyWorkbookImportEffects((fn) => { fn(access2) }, () => access2, second, { fileName: 'b.xlsx' })
    vi.advanceTimersByTime(500)
    expect(seen).toEqual(['second'])
    vi.useRealTimers()
  })
})

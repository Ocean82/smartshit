import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from '@/store/useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { saveCustomRules } from '@/auditor/customRules'

describe('runActiveSheetAudit', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v) },
      removeItem: (k: string) => { storage.delete(k) },
    })
    const wb = createEmptyWorkbook('Audit')
    wb.sheets[0].cells = {
      A1: { value: 'Item' },
      B1: { value: 'Amount' },
      A2: { value: 'Rent' },
      B2: { value: 9000 },
    }
    useStore.getState().engine.loadWorkbook(wb)
    useStore.setState({ workbook: wb, activeSheetId: wb.activeSheetId, lastAuditResult: null })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('stores one result for the active sheet, including custom rules', () => {
    saveCustomRules([{
      id: 'big', name: 'Big', column: 'B', operator: 'gt', value: 5000, severity: 'high', enabled: true,
    }])
    const result = useStore.getState().runActiveSheetAudit()
    const state = useStore.getState()
    expect(state.lastAuditResult).toBe(result)
    expect(result.sheetId).toBe(state.activeSheetId)
    expect(result.findings.some((f) => f.ruleId === 'custom:big')).toBe(true)
  })
})

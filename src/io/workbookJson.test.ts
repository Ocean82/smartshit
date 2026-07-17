import { describe, expect, it } from 'vitest'
import {
  serializeWorkbookPackage,
  parseWorkbookJson,
  normalizeImportedWorkbook,
} from './workbookJson'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

describe('workbookJson', () => {
  it('round-trips an empty workbook package', () => {
    const wb = createEmptyWorkbook('Backup Test')
    const pkg = serializeWorkbookPackage(wb)
    expect(pkg.type).toBe('smartsht-workbook')
    expect(pkg.version).toBe(1)

    const restored = parseWorkbookJson(JSON.stringify(pkg))
    expect(restored.name).toBe('Backup Test')
    expect(restored.sheets).toHaveLength(1)
    expect(restored.activeSheetId).toBe(wb.activeSheetId)
  })

  it('accepts bare WorkbookData JSON', () => {
    const wb = createEmptyWorkbook('Bare')
    wb.sheets[0].cells['A1'] = { value: 42 }
    const restored = parseWorkbookJson(JSON.stringify(wb))
    expect(restored.sheets[0].cells['A1']?.value).toBe(42)
  })

  it('normalizes missing sheet arrays', () => {
    const wb = createEmptyWorkbook('Norm')
    const raw = {
      ...wb,
      sheets: [{
        id: wb.sheets[0].id,
        name: 'Sheet1',
        cells: { A1: { value: 'hi' } },
      }],
    }
    const normalized = normalizeImportedWorkbook(raw as unknown as typeof wb)
    expect(normalized.sheets[0].columnWidths).toEqual({})
    expect(normalized.sheets[0].rowHeights).toEqual({})
    expect(normalized.sheets[0].charts).toEqual([])
  })

  it('rejects invalid JSON payloads', () => {
    expect(() => parseWorkbookJson('{not json')).toThrow()
    expect(() => parseWorkbookJson('{"foo":1}')).toThrow(/not a smartsht workbook/)
  })
})

import { describe, expect, it } from 'vitest'
import type { CellData, SheetData } from '@/types'
import type { ActionStep } from '@/ai/nlp/types'
import { buildActionPreview, previewExecuteMacro } from './previewBuilders'

function makeSheet(cells: Record<string, CellData>): SheetData {
  return { id: 's1', name: 'Sheet1', cells, columnWidths: {}, rowHeights: {} }
}

const noComputed = () => ''

describe('previewExecuteMacro — value-safe makeover preview', () => {
  it('(a) a format_cells step over populated cells preserves value and formula', () => {
    const sheet = makeSheet({
      A1: { value: 'Rent' },
      A2: { value: 1200 },
      A3: { formula: '=A2*2', value: 2400 },
    })
    const steps: ActionStep[] = [
      { tool: 'format_cells', params: { range: 'A1:A3', bold: true }, description: 'Style A1:A3' },
    ]
    const changes = previewExecuteMacro(sheet, steps)
    expect(changes.length).toBe(3)
    for (const change of changes) {
      const current = sheet.cells[change.cell]
      // value preserved (not null/blank) and formula preserved
      expect(change.newValue).toBe(current?.value ?? null)
      expect(change.newFormula).toBe(current?.formula)
      expect(change.newValue).toBe(change.oldValue)
      expect(change.newFormula).toBe(change.oldFormula)
    }
  })

  it('(b) a layout-only (auto_fit) plan yields a non-empty preview so the action is previewable', () => {
    const sheet = makeSheet({ A1: { value: 'Header' }, A2: { value: 10 } })
    const steps: ActionStep[] = [
      { tool: 'auto_fit', params: {}, description: 'Auto-fit rows so nothing is clipped' },
    ]
    const preview = buildActionPreview('execute_macro', { steps }, sheet, noComputed)
    expect(preview).toBeDefined()
    expect(preview!.changes.length).toBeGreaterThan(0)
    // Still value-safe: the anchor change preserves the cell's content.
    const anchor = preview!.changes[0]
    const current = sheet.cells[anchor.cell]
    expect(anchor.newValue).toBe(current?.value ?? null)
    expect(anchor.newFormula).toBe(current?.formula)
  })

  it('(c) two overlapping ranges emit each cell exactly once', () => {
    const sheet = makeSheet({
      A1: { value: 1 }, A2: { value: 2 }, A3: { value: 3 },
    })
    const steps: ActionStep[] = [
      { tool: 'format_cells', params: { range: 'A1:A2', bold: true }, description: 'Bold A1:A2' },
      { tool: 'format_cells', params: { range: 'A2:A3', italic: true }, description: 'Italic A2:A3' },
    ]
    const changes = previewExecuteMacro(sheet, steps)
    const ids = changes.map((c) => c.cell)
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
    expect(new Set(ids)).toEqual(new Set(['A1', 'A2', 'A3']))
  })

  it('(e) a conditional negative-emphasis step previews ONLY the negative cells (finding #7)', () => {
    const sheet = makeSheet({
      C1: { value: 'Budget' },
      C2: { value: 1200 },  // positive — Apply would NOT format
      C3: { value: -50 },   // negative — Apply WOULD format
      C4: { value: 0 },     // zero — Apply would NOT format
      C5: { value: -300 },  // negative — Apply WOULD format
    })
    const computed = (r: number, c: number): string => {
      const cell = sheet.cells[`${String.fromCharCode(65 + c)}${r + 1}`]
      return cell?.value == null ? '' : String(cell.value)
    }
    const steps: ActionStep[] = [
      {
        tool: 'format_cells',
        params: { range: 'C2:C5', condition: { operator: 'negative' }, bgColor: '#fee2e2' },
        description: 'Highlight negative Budget values in red',
      },
    ]
    const changes = previewExecuteMacro(sheet, steps, computed)
    const ids = changes.map((c) => c.cell).sort()
    // Only the two negative cells are previewed; positive/zero are excluded.
    expect(ids).toEqual(['C3', 'C5'])
    // Still value/formula-preserving (never a data write).
    for (const change of changes) {
      const current = sheet.cells[change.cell]
      expect(change.newValue).toBe(current?.value ?? null)
      expect(change.newFormula).toBe(current?.formula)
    }
  })

  it('(f) an unconditional format_cells step still previews every cell in range', () => {
    const sheet = makeSheet({ C2: { value: 1200 }, C3: { value: -50 }, C4: { value: 0 } })
    const steps: ActionStep[] = [
      { tool: 'format_cells', params: { range: 'C2:C4', bold: true }, description: 'Bold C2:C4' },
    ]
    const changes = previewExecuteMacro(sheet, steps)
    expect(changes.map((c) => c.cell).sort()).toEqual(['C2', 'C3', 'C4'])
  })

  it('(d) a very large range is capped at the preview constant', () => {
    // 500 populated cells in column A; the range targets all of them.
    const cells: Record<string, CellData> = {}
    for (let r = 1; r <= 500; r++) cells[`A${r}`] = { value: r }
    const sheet = makeSheet(cells)
    const steps: ActionStep[] = [
      { tool: 'format_cells', params: { range: 'A1:A500', bold: true }, description: 'Bold A1:A500' },
    ]
    const changes = previewExecuteMacro(sheet, steps)
    // 200 per-cell entries + 1 summary row = 201; never one-per-cell for 500.
    expect(changes.length).toBeLessThanOrEqual(201)
    expect(changes.length).toBeGreaterThan(0)
    // Every emitted change is still value/formula-preserving.
    for (const change of changes) {
      const current = sheet.cells[change.cell]
      expect(change.newValue).toBe(current?.value ?? null)
      expect(change.newFormula).toBe(current?.formula)
    }
  })
})

/**
 * Integration test for the AgentParser stage + value-safe makeover (FEAT-002).
 *
 * Unlike agentParser.test.ts (which mocks @/agent and toolRegistry), this runs
 * the REAL createAgentParserStage over the REAL parseMessage and REAL
 * toolRegistry on a live budget sheet. It guards the regression where a
 * makeover phrase produced an `execute_macro` call that — because execute_macro
 * is intentionally absent from toolRegistry — fell through to inline executeTool
 * and returned "Unknown tool: execute_macro" with no preview.
 *
 * Contract asserted end to end:
 *   - a makeover phrase yields exactly ONE execute_macro action,
 *   - nothing is executed inline (no "Unknown tool" / no modified count),
 *   - buildActionPreview produces a NON-EMPTY, format-only preview
 *     (every change leaves value/formula untouched).
 */

import { describe, expect, it } from 'vitest'
import type { CellData, SheetData, WorkbookData } from '@/types'
import type { PipelineContext } from '../types'
import { createAgentParserStage } from '../stages/agentParser'
import { buildActionPreview } from '@/lib/previewBuilders'

function makeSheet(cells: Record<string, CellData>): SheetData {
  return { id: 's1', name: 'Sheet1', cells, columnWidths: {}, rowHeights: {} }
}

// Budget sheet: Date | Category | Budget (mirrors parser.makeover.test.ts).
function budgetSheet(): SheetData {
  return makeSheet({
    A1: { value: 'Date' }, B1: { value: 'Category' }, C1: { value: 'Budget' },
    A2: { value: '2026-01-01' }, B2: { value: 'Rent' }, C2: { value: 1200 },
    A3: { value: '2026-01-02' }, B3: { value: 'Refund' }, C3: { value: -50 },
    A4: { value: '2026-01-03' }, B4: { value: 'Food' }, C4: { value: 300 },
  })
}

function makeContext(sheet: SheetData, message: string): PipelineContext {
  const getComputedValue = (r: number, c: number): string => {
    const cell = sheet.cells[`${String.fromCharCode(65 + c)}${r + 1}`]
    return cell?.value == null ? '' : String(cell.value)
  }
  return {
    message,
    workbook: { sheets: [sheet], name: 'test' } as unknown as WorkbookData,
    sheet,
    selection: null,
    getComputedValue,
    applyPosture: 'preview',
  }
}

// Minimal deps: if the stage ever tried to execute inline, this pushHistory
// spy would fire and buildExecContext would be invoked — we assert neither.
function makeDeps() {
  let pushCount = 0
  return {
    deps: {
      buildExecContext: () => { throw new Error('buildExecContext must not be called for a makeover preview') },
      pushHistory: () => { pushCount += 1 },
    },
    pushCount: () => pushCount,
  }
}

describe('AgentParser stage — makeover execute_macro preview (real toolRegistry)', () => {
  it.each(['make this look professional', 'clean up the formatting'])(
    'routes "%s" to ONE execute_macro Apply/Reject action with a non-empty format-only preview, no inline run',
    async (phrase) => {
      const sheet = budgetSheet()
      const { deps, pushCount } = makeDeps()

      const result = await createAgentParserStage(deps).process(makeContext(sheet, phrase))

      // Claimed, as an action — never executed inline.
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(result!.message).not.toMatch(/unknown tool/i)
      expect(result!.message).not.toMatch(/cells? modified/i)
      expect(pushCount()).toBe(0)

      // Exactly one execute_macro action.
      expect(result!.actions).toHaveLength(1)
      const action = result!.actions![0]
      expect(action.tool).toBe('execute_macro')
      expect(Array.isArray(action.params.steps)).toBe(true)
      expect((action.params.steps as unknown[]).length).toBeGreaterThan(0)

      // Preview is built downstream exactly as responseBuilder does it.
      const preview = buildActionPreview(action.tool, action.params, sheet, makeContext(sheet, phrase).getComputedValue)
      expect(preview).toBeDefined()
      expect(preview!.changes.length).toBeGreaterThan(0)
      // Value-safe contract (finding #4): a format-only preview preserves each
      // cell's CURRENT value/formula rather than blanking it to null — a
      // null newValue would render as an empty cell and look like data deletion.
      for (const change of preview!.changes) {
        const current = sheet.cells[change.cell]
        expect(change.newValue).toBe(current?.value ?? null) // value untouched
        expect(change.newFormula).toBe(current?.formula) // formula untouched
      }
    },
  )

  it('routes a real makeover to the execute_macro preview, NOT the destructive "remove all data" warning (finding #7)', async () => {
    const sheet = budgetSheet()
    const { deps } = makeDeps()

    const result = await createAgentParserStage(deps).process(makeContext(sheet, 'make this look professional'))

    // Ordering/routing pin: a makeover must land on handleMacroPreview, never
    // handleDestructivePreview. execute_macro stays out of the pipeline's
    // DESTRUCTIVE_TOOLS set ({'clear_sheet'} only), so the user never sees the
    // destructive "remove all data" warning for a format-only makeover.
    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('execute-macro-preview')
    expect(result!.metadata?.toolUsed).not.toBe('destructive-preview')
    expect(result!.message).not.toMatch(/remove all data/i)
    expect(result!.message).not.toMatch(/⚠️/)
  })

  it('still defers a question-framed professionalize request to the next stage (null)', async () => {
    const sheet = budgetSheet()
    const { deps } = makeDeps()
    const result = await createAgentParserStage(deps).process(makeContext(sheet, 'should I make this professional?'))
    expect(result).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { shouldAutoApply, AUTO_APPLY_LOW_RISK_TOOLS } from './applyPosture'

// The two real denylist sets, copied verbatim from their modules so this test
// documents the override surface. Kept separate so a reader sees they are
// distinct sets, not one conflated list.
const HIGH_IMPACT_TOOLS = [
  'clear_sheet',
  'clean_sheet_data',
  'delete_row',
  'modify_column',
  'apply_formula',
  'execute_script',
  'style_recipe',
] // chatSlice.ts highImpactTools

const DESTRUCTIVE_TOOLS = [
  'sort_sheet',
  'multi_sort',
  'filter',
  'delete_row',
  'clear_sheet',
  'modify_column',
  'find_and_replace',
] // semanticCapabilityRouter.ts DESTRUCTIVE_TOOLS

describe('shouldAutoApply — posture decision predicate', () => {
  const allowlist = [...AUTO_APPLY_LOW_RISK_TOOLS]

  it('preview posture never auto-applies — not even allowlist tools', () => {
    for (const tool of allowlist) {
      expect(shouldAutoApply(tool, 'preview')).toBe(false)
    }
    for (const tool of [...HIGH_IMPACT_TOOLS, 'read_range', 'unknown_tool']) {
      expect(shouldAutoApply(tool, 'preview')).toBe(false)
    }
  })

  it('auto posture auto-applies every allowlist tool', () => {
    expect(allowlist).toEqual([
      'format_cells',
      'set_column_width',
      'set_row_height',
      'auto_fit',
      'rename_header',
    ])
    for (const tool of allowlist) {
      expect(shouldAutoApply(tool, 'auto')).toBe(true)
    }
  })

  it('style_recipe stays preview-only even under auto (kept off the allowlist)', () => {
    expect(shouldAutoApply('style_recipe', 'auto')).toBe(false)
  })

  it('destructive override: every denylist tool is preview under auto', () => {
    const union = new Set([...HIGH_IMPACT_TOOLS, ...DESTRUCTIVE_TOOLS])
    // Explicitly covers multi_sort and clean_sheet_data.
    expect(union.has('multi_sort')).toBe(true)
    expect(union.has('clean_sheet_data')).toBe(true)
    for (const tool of union) {
      expect(shouldAutoApply(tool, 'auto')).toBe(false)
    }
  })

  it('unknown/typo tool names are preview under auto (allowlist, not denylist)', () => {
    expect(shouldAutoApply('format_cellz', 'auto')).toBe(false)
    expect(shouldAutoApply('', 'auto')).toBe(false)
  })

  it('allowlist and denylist sets are disjoint by design', () => {
    const denylist = new Set([...HIGH_IMPACT_TOOLS, ...DESTRUCTIVE_TOOLS])
    for (const tool of allowlist) {
      expect(denylist.has(tool)).toBe(false)
    }
  })

  // The makeover's opt-in totals step (style_recipe: total_row) and the macro
  // carrier (execute_macro) must stay preview-only and off the auto-apply
  // allowlist — they are the only steps that could ever write cell data.
  it('totals step and macro carrier are preview-only, never auto-applied', () => {
    expect(shouldAutoApply('style_recipe', 'auto')).toBe(false)
    expect(shouldAutoApply('execute_macro', 'auto')).toBe(false)
    for (const tool of ['style_recipe', 'execute_macro', 'set_cell', 'apply_formula']) {
      expect(AUTO_APPLY_LOW_RISK_TOOLS.has(tool)).toBe(false)
    }
  })
})

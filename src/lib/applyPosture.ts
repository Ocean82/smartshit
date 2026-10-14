/**
 * Apply-posture decision — the single, shared predicate every mutation
 * decision point consults to decide "apply instantly" vs "show a preview".
 *
 * The destructive/high-impact override lives INSIDE this function (as an
 * allowlist, not a denylist) so no call site can accidentally auto-apply a
 * dangerous tool: a tool auto-applies ONLY when posture === 'auto' AND it is in
 * the low-risk allowlist. Everything else — every high-impact tool, and
 * anything not on the allowlist — previews.
 */

import type { ApplyPosture } from '@/types/ui'

/**
 * Pure-formatting / layout tools that 'auto' posture may apply instantly.
 * These never write cell values or formulas and never remove data, so an
 * instant apply with Undo is safe. `style_recipe` is deliberately EXCLUDED
 * (it writes values/formulas and carries a session-only-undo caveat) and
 * always previews, even under 'auto'.
 */
export const AUTO_APPLY_LOW_RISK_TOOLS = new Set<string>([
  'format_cells', // bold/italic/colors/borders/number-format/conditional — formatting only
  'set_column_width', // layout only, clamped 40–400
  'set_row_height', // layout only, clamped 20–400
  'auto_fit', // layout only (row heights)
  'rename_header', // single header label; reversible, no data loss
])

/**
 * The ONE decision every call site must use. Given the tool and the user's
 * posture, decide whether to apply instantly (true) or present a preview (false).
 */
export function shouldAutoApply(tool: string, posture: ApplyPosture): boolean {
  if (posture !== 'auto') return false
  return AUTO_APPLY_LOW_RISK_TOOLS.has(tool)
}

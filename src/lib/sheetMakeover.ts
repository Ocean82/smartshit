/**
 * sheetMakeover — the value-safe "professionalize my sheet" plan builder.
 *
 * Produces an ordered list of formatting {@link ActionStep}s that style a sheet
 * like a pro WITHOUT writing any cell values or formulas. Every emitted step's
 * tool is a member of {@link AUTO_APPLY_LOW_RISK_TOOLS} (format_cells + layout),
 * so the whole plan is a zero-data-write diff: it can only change formatting,
 * never contents. The data-writing totals recipe (`style_recipe: total_row`)
 * is deliberately NOT part of this plan — it stays an opt-in, preview-only
 * follow-up (see docs/spreadsheet-styling-standard.md §2 and the plan).
 *
 * No NL wiring lives here; FEAT-002 triggers this builder and FEAT-003 catalogs
 * it. This module is a pure library over the existing profile + table-range
 * detection.
 */

import type { CellFormat, SheetData } from '@/types'
import type { ColumnRole, SheetProfile, SheetPurpose } from '@/ai/types'
import type { ActionStep } from '@/ai/nlp/types'
import { colToLetter, refToCell } from '@/engine/spreadsheet'
import { AUTO_APPLY_LOW_RISK_TOOLS } from '@/lib/applyPosture'
import { detectTableRange, TABLE_THEMES } from '@/lib/formatAsTable'
import { detectPurpose, inferRole } from '@/ai/sheetProfile'

/**
 * Map a column's inferred role (+ the sheet's detected purpose) to the
 * numberFormat token format_cells should apply, or null to leave the column as
 * text (id/category/label/description/unknown). Mirrors the plan's Build-order
 * step 2 table.
 */
export function roleToNumberFormat(role: ColumnRole, purpose: SheetPurpose): string | null {
  switch (role) {
    case 'date':
      return 'date'
    case 'percentage':
      return 'percent'
    case 'quantity':
      return 'number-int'
    case 'amount':
      // Currency only for money-shaped purposes; generic sheets get a plain
      // number so we never assume a currency the data may not carry.
      return purpose === 'budget' || purpose === 'invoice' || purpose === 'inventory' || purpose === 'sales'
        ? 'currency'
        : 'number'
    // id / category / label / description / unknown → leave as text (no step).
    default:
      return null
  }
}

/** The theme used to color the header row, keyed by detected purpose. */
function themeForPurpose(purpose: SheetPurpose): (typeof TABLE_THEMES)[string] {
  const key: Record<SheetPurpose, string> = {
    budget: 'green',
    invoice: 'slate',
    inventory: 'orange',
    sales: 'purple',
    generic: 'blue',
  }
  return TABLE_THEMES[key[purpose]] ?? TABLE_THEMES.blue
}

/** Does the header-row cell already carry every key the makeover would set? */
function headerAlreadyStyled(fmt: CellFormat | undefined, theme: (typeof TABLE_THEMES)[string]): boolean {
  if (!fmt) return false
  // Compare EVERY property the header-format step sets (see buildMakeoverPlan's
  // (1) header styling). A cell that matches bold+bg but carries a different
  // fontColor or a non-exact bottom border is NOT already styled — otherwise
  // the guard would skip the step and leave headers inconsistently styled.
  return (
    fmt.bold === true &&
    fmt.bgColor === theme.headerBg &&
    fmt.fontColor === theme.headerFontColor &&
    fmt.borders?.bottom === `2px solid ${theme.accentColor}`
  )
}

/**
 * Build the value-safe makeover plan: ordered, format-only {@link ActionStep}s.
 *
 * Order (spec Part 2): (1) header styling, (2) per-column numberFormat,
 * (3) layout (auto_fit), (4) at most one conditional emphasis on an amount
 * column. The spec §3 "already-styled" guard skips steps whose formatting is
 * already present, keeping re-runs near-idempotent.
 *
 * @param getComputedValue reserved for callers that resolve displayed values;
 *   detection already receives it, kept in the signature for parity with the
 *   profile/table-range helpers FEAT-002 passes through.
 */
export function buildMakeoverPlan(
  sheet: SheetData,
  profile: SheetProfile,
  getComputedValue: (row: number, col: number) => string,
): { steps: ActionStep[]; summary: string } {
  const steps: ActionStep[] = []

  const range = detectTableRange(sheet, getComputedValue)
  if (!range) {
    return { steps, summary: 'Nothing to format — the sheet is empty.' }
  }

  const { headerRow, startCol, endCol, endRow } = range
  const dataStartRow = headerRow + 1

  // Role/purpose inference MUST honor the DETECTED header row. buildSheetProfile
  // (the `profile` arg) hardcodes headerRow=0, so when detectTableRange finds a
  // header below row 0 (e.g. a title row at row 0), profile.columns roles and
  // profile.detectedPurpose describe the wrong row. Re-infer both from the
  // detected header labels + the data rows beneath them so number formats land
  // on the right columns. (finding #5)
  const headerLabels: string[] = []
  const rolesByCol = new Map<number, ColumnRole>()
  const valuesByCol = new Map<number, (string | number | null)[]>()
  for (let c = startCol; c <= endCol; c++) {
    const cell = sheet.cells[refToCell(headerRow, c)]
    const computed = getComputedValue(headerRow, c)
    const fallback = `Column ${colToLetter(c)}`
    const label = String(cell?.value ?? computed ?? fallback).trim() || fallback
    headerLabels.push(label)

    const values: (string | number | null)[] = []
    for (let r = dataStartRow; r <= endRow; r++) {
      const dataCell = sheet.cells[refToCell(r, c)]
      const dataComputed = getComputedValue(r, c)
      const raw = dataCell?.formula
        ? (dataComputed !== '' ? dataComputed : (dataCell.value ?? null))
        : (dataCell?.value ?? (dataComputed || null))
      if (raw === null || raw === '') continue
      values.push(typeof raw === 'number' ? raw : String(raw))
    }
    rolesByCol.set(c, inferRole(label, values))
    valuesByCol.set(c, values)
  }

  const purpose = detectPurpose(headerLabels)
  const theme = themeForPurpose(purpose)

  // ── (1) Header styling: bold + fill + bottom border on the header row ──────
  // Skip if the whole header row already carries those keys (§3 guard).
  const headerFullyStyled = (() => {
    for (let c = startCol; c <= endCol; c++) {
      const fmt = sheet.cells[`${colToLetter(c)}${headerRow + 1}`]?.format
      if (!headerAlreadyStyled(fmt, theme)) return false
    }
    return true
  })()

  if (!headerFullyStyled) {
    const headerRange = `${colToLetter(startCol)}${headerRow + 1}:${colToLetter(endCol)}${headerRow + 1}`
    steps.push({
      tool: 'format_cells',
      params: {
        range: headerRange,
        bold: true,
        bgColor: theme.headerBg,
        fontColor: theme.headerFontColor,
        borders: { bottom: `2px solid ${theme.accentColor}` },
      },
      description: `Style the header row (${headerRange}) bold with a ${theme.name.toLowerCase()} fill`,
    })
  }

  // ── (2) Per-column numberFormat for roles that map to a format ─────────────
  // Only when data rows exist, and only when the column isn't already the
  // user's (§3 guard). §3 says never strip a user's deliberate formatting to
  // impose the house default, so the predicate is PRESENCE of ANY user-set
  // numberFormat token — not equality with the token the makeover would apply.
  // A column the user gave a *different* format (accounting, currency-eur, a
  // date variant) is their territory; apply only to columns with NO user
  // number format. Per-column granularity (Option A): a column is either fully
  // the user's (skipped) or has no user number format (full house default on
  // the whole data range). Blank cells never count as "styled".
  if (endRow >= dataStartRow) {
    for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
      // Roles are inferred from the DETECTED header row (rolesByCol), keyed by
      // spreadsheet column index — not profile.columns, which assumes row 0.
      const role = rolesByCol.get(colIdx) ?? 'unknown'
      const numberFormat = roleToNumberFormat(role, purpose)
      if (!numberFormat) continue

      const colName = headerLabels[colIdx - startCol] ?? colToLetter(colIdx)
      const letter = colToLetter(colIdx)
      const alreadyFormatted = (() => {
        for (let r = dataStartRow; r <= endRow; r++) {
          const cell = sheet.cells[`${letter}${r + 1}`]
          // A blank cell carries no format and shouldn't block the step.
          if (!cell || (cell.value == null && !cell.formula)) continue
          if (typeof cell.format?.numberFormat === 'string') return true
        }
        return false
      })()
      if (alreadyFormatted) continue

      const colRange = `${letter}${dataStartRow + 1}:${letter}${endRow + 1}`
      steps.push({
        tool: 'format_cells',
        params: { range: colRange, numberFormat },
        description: `Format ${colName} (${colRange}) as ${numberFormat}`,
      })
    }
  }

  // ── (3) Layout: auto-fit so the restyled content isn't clipped ─────────────
  steps.push({
    tool: 'auto_fit',
    params: {},
    description: 'Auto-fit rows so nothing is clipped',
  })

  // ── (4) At most ONE conditional emphasis: red fill on negative amounts ─────
  if (endRow >= dataStartRow) {
    let amountColIdx = -1
    for (let c = startCol; c <= endCol; c++) {
      if (rolesByCol.get(c) === 'amount') {
        amountColIdx = c
        break
      }
    }
    // Only emit the negative-emphasis step when the amount column ACTUALLY
    // holds a negative value. applyFormatCells treats a condition that matches
    // zero cells as a failure, which would roll back the whole macro; skipping
    // the step here keeps that "nothing matched = failure" contract meaningful
    // for genuine user commands while never failing a clean makeover. (finding #6)
    const hasNegativeAmount =
      amountColIdx >= 0 &&
      (valuesByCol.get(amountColIdx) ?? []).some((v) => {
        const num = typeof v === 'number' ? v : Number.parseFloat(String(v))
        return Number.isFinite(num) && num < 0
      })
    // §3 guard: if the user already gave the amount column its own fill/font
    // convention, that IS their house style — don't paint the house red over
    // it. Presence of ANY user bgColor/fontColor on a non-blank data cell means
    // hands off (per-column skip, matching the live-condition's whole-column
    // granularity). Blank cells never count. §3 outranks the house accent, so
    // the live-condition emphasis is sacrificed rather than overwriting a
    // user's deliberate fill.
    const amountColUserFilled =
      amountColIdx >= 0 &&
      (() => {
        const letter = colToLetter(amountColIdx)
        for (let r = dataStartRow; r <= endRow; r++) {
          const cell = sheet.cells[`${letter}${r + 1}`]
          if (!cell || (cell.value == null && !cell.formula)) continue
          if (cell.format?.bgColor != null || cell.format?.fontColor != null) return true
        }
        return false
      })()
    if (amountColIdx >= 0 && hasNegativeAmount && !amountColUserFilled) {
      const amountName = headerLabels[amountColIdx - startCol] ?? colToLetter(amountColIdx)
      const letter = colToLetter(amountColIdx)
      const colRange = `${letter}${dataStartRow + 1}:${letter}${endRow + 1}`
      steps.push({
        tool: 'format_cells',
        params: {
          range: colRange,
          condition: { operator: 'negative' },
          bgColor: '#fee2e2',
          fontColor: '#b91c1c',
        },
        description: `Highlight negative ${amountName} values in red`,
      })
    }
  }

  // ponytail: value-safety self-check — a makeover must NEVER emit a
  // data-writing tool. Assert every step is on the auto-apply allowlist
  // (format_cells + layout only); throwing here is a loud dev-time guard, not a
  // silent downgrade. Ceiling: trusts AUTO_APPLY_LOW_RISK_TOOLS as the single
  // source of truth; if a data-writing tool is ever added to that set this
  // check stops protecting us (upgrade: a dedicated value-safe allowlist).
  for (const step of steps) {
    if (!AUTO_APPLY_LOW_RISK_TOOLS.has(step.tool)) {
      throw new Error(`sheetMakeover produced a non-value-safe step: ${step.tool}`)
    }
  }

  const summary = steps.length === 1 && steps[0].tool === 'auto_fit'
    ? 'This sheet already looks styled — just tidying the layout.'
    : `Professionalize ${profile.name}: ${steps.length} formatting step${steps.length === 1 ? '' : 's'}, no data changes.`

  return { steps, summary }
}

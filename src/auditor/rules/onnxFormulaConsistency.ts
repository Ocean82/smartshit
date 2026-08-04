/**
 * Rule: ONNX Formula Consistency
 *
 * Detects columns that mix native spreadsheet formulas with ONNX.RUN formulas.
 * Only flags when one formula type constitutes ≥70% of formula cells in a column
 * with at least 3 formula cells. The minority-type cells are flagged with
 * severity "high".
 *
 * Requirements: 8.1, 8.4
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, colToLetter } from '../utils'

/** Minimum formula cells in a column to trigger consistency checks. */
const MIN_FORMULA_CELLS = 3

/** Threshold at which the dominant type triggers flagging of the minority. */
const DOMINANCE_THRESHOLD = 0.7

/** Check if a formula is an ONNX formula (starts with ONNX. function call). */
function isOnnxFormula(formula: string): boolean {
  return /^ONNX\./i.test(formula.trim())
}

export const onnxFormulaConsistencyRule: AuditRule = {
  id: 'onnx-formula-consistency',
  name: 'ONNX Formula Consistency',
  description: 'Detects inconsistent mixing of native and ONNX formulas in columns',
  defaultSeverity: 'high',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (let col = 0; col <= ctx.maxCol; col++) {
      const colCells = ctx.getColumn(col)
      const formulaCells = colCells.filter((c) => c.formula)

      if (formulaCells.length < MIN_FORMULA_CELLS) continue

      const onnxCells = formulaCells.filter((c) => isOnnxFormula(c.formula!))
      const nativeCells = formulaCells.filter((c) => !isOnnxFormula(c.formula!))

      const onnxRatio = onnxCells.length / formulaCells.length
      const nativeRatio = nativeCells.length / formulaCells.length

      if (onnxRatio >= DOMINANCE_THRESHOLD && nativeCells.length > 0) {
        // ONNX is dominant — flag native cells as minority
        findings.push(
          createFinding(nativeCells, col, 'native', 'ONNX.RUN', onnxCells.length, formulaCells.length),
        )
      } else if (nativeRatio >= DOMINANCE_THRESHOLD && onnxCells.length > 0) {
        // Native is dominant — flag ONNX cells as minority
        findings.push(
          createFinding(onnxCells, col, 'ONNX.RUN', 'native', nativeCells.length, formulaCells.length),
        )
      }
    }

    return findings
  },
}

function createFinding(
  minorityCells: CellInfo[],
  col: number,
  minorityType: string,
  dominantType: string,
  dominantCount: number,
  totalFormulaCells: number,
): AuditFinding {
  const colLabel = colToLetter(col)
  const cellAddresses = minorityCells.map((c) => c.cellId).join(', ')

  return {
    id: findingId(),
    ruleId: 'onnx-formula-consistency',
    severity: 'high',
    title: `Inconsistent formula types in column ${colLabel}`,
    message: `Column ${colLabel} has ${totalFormulaCells} formula cells where ${dominantCount} use ${dominantType} formulas. The following ${minorityType} formula cells break the dominant pattern: ${cellAddresses}`,
    cells: minorityCells.map((c) => ({ cellId: c.cellId, row: c.row, col: c.col })),
    suggestion: `Consider converting the ${minorityType} formulas in ${cellAddresses} to ${dominantType} formulas for consistency`,
    autoFixable: false,
  }
}

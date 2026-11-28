/**
 * Health score: 100 minus penalties, never below 0.
 *
 * - Severity weights: critical 20, high 10, medium 5, low 2, info 0.
 * - One rule can take at most 40 points, so a single noisy rule (a pasted
 *   block that trips "inconsistent formulas") cannot zero the score.
 * - Above 100 formulas, non-critical weight is divided by formulas/100. Ten
 *   typos in a 50-formula sheet are a problem; in a 5,000-formula model they
 *   are a rounding error. Critical findings (#REF!, cycles, missing sheets)
 *   always count in full, since one is enough to break the workbook.
 */

import type { AuditFinding, Severity } from './types'

const WEIGHTS: Record<Severity, number> = { critical: 20, high: 10, medium: 5, low: 2, info: 0 }

/** Most points any single rule can take off the 100-point health score. */
export const MAX_PENALTY_PER_RULE = 40

/** Formulas a sheet may have before non-critical findings start to be diluted. */
const FULL_WEIGHT_FORMULAS = 100

export function computeHealthScore(findings: readonly AuditFinding[], formulaCount: number): number {
  const dilution = Math.max(1, formulaCount / FULL_WEIGHT_FORMULAS)
  const penaltyByRule = new Map<string, number>()
  for (const f of findings) {
    const weight = f.severity === 'critical' ? WEIGHTS.critical : WEIGHTS[f.severity] / dilution
    penaltyByRule.set(f.ruleId, (penaltyByRule.get(f.ruleId) ?? 0) + weight)
  }
  let totalPenalty = 0
  for (const penalty of penaltyByRule.values()) totalPenalty += Math.min(penalty, MAX_PENALTY_PER_RULE)
  return Math.max(0, Math.min(100, Math.round(100 - totalPenalty)))
}

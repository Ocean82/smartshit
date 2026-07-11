/**
 * Rule Registry — all audit rules in execution order.
 * Critical rules run first so the most important findings appear at the top.
 */

import type { AuditRule } from '../types'
import { errorCellsRule } from './errorCells'
import { circularRefsRule } from './circularRefs'
import { rangeGapsRule } from './rangeGaps'
import { inconsistentFormulasRule } from './inconsistentFormulas'
import { hardcodedConstantsRule } from './hardcodedConstants'
import { magnitudeOutliersRule } from './magnitudeOutliers'
import { volatileFunctionsRule } from './volatileFunctions'
import { orphanedFormulasRule } from './orphanedFormulas'

export const ALL_RULES: AuditRule[] = [
  // Critical
  errorCellsRule,
  circularRefsRule,
  // High
  rangeGapsRule,
  inconsistentFormulasRule,
  // Medium
  hardcodedConstantsRule,
  // Low
  magnitudeOutliersRule,
  orphanedFormulasRule,
  // Info
  volatileFunctionsRule,
]

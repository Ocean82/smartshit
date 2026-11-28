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
import { hiddenDependenciesRule } from './hiddenDependencies'
import { magnitudeOutliersRule } from './magnitudeOutliers'
import { volatileFunctionsRule } from './volatileFunctions'
import { duplicateFormulasRule } from './duplicateFormulas'
import { onnxFormulaConsistencyRule } from './onnxFormulaConsistency'
import { hardcodedWeightsRule } from './hardcodedWeights'
import { overwrittenFormulasRule } from './overwrittenFormulas'
import { missingSheetReferencesRule } from './missingSheetReferences'
import { numbersAsTextRule } from './numbersAsText'
import { approximateLookupRule } from './approximateLookup'
import { percentDecimalMixRule } from './percentDecimalMix'
import { orphanedInputsRule } from './orphanedInputs'

export const ALL_RULES: AuditRule[] = [
  // Critical
  errorCellsRule,
  circularRefsRule,
  missingSheetReferencesRule,
  // High
  rangeGapsRule,
  inconsistentFormulasRule,
  overwrittenFormulasRule,
  onnxFormulaConsistencyRule,
  // Medium
  hardcodedConstantsRule,
  hardcodedWeightsRule,
  hiddenDependenciesRule,
  numbersAsTextRule,
  approximateLookupRule,
  percentDecimalMixRule,
  // Low
  magnitudeOutliersRule,
  // Info
  volatileFunctionsRule,
  duplicateFormulasRule,
  orphanedInputsRule,
]

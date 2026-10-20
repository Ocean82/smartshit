/**
 * IntentClassifier Stage — Enriches context with intent and mode classification.
 *
 * Normally returns null (enrich-only). Claims only when regex and NLP disagree
 * across mutate vs analyze buckets — then returns mode-pick clarify chips.
 *
 * Dual classification strategy:
 * 1. Always run regex-based parseUserIntent() for entity extraction
 * 2. If NLP engine is ready, run semantic classification for intent type
 * 3. Cross-bucket conflict (both confident) → clarify chips (mode-pick)
 * 4. Else if NLP confidence > regex, override intentType with NLP result
 * 5. Mark routingSource ('nlp' | 'regex') on the intent for observability
 *
 * `resolvedMode` (from a prior mode-pick chip) forces mode and skips re-clarify.
 */

import type { IntentType } from '@shared/intentTypes'
import type { PipelineContext, PipelineStage, StageResult } from '../types'
import { parseUserIntent } from '@shared/intentParser'
import { classifyMode } from '@shared/mode'
import { modePickMessage } from '@/ai/capabilities/clarifyChips'
import { getNLPEngine } from '@/ai/nlp/nlpEngine'
import { isBootstrapped } from '@/ai/nlp/intentEmbeddings'

/** Minimum confidence on each side before treating a type mismatch as conflict. */
const CONFLICT_CONFIDENCE = 0.5

/** Minimum NLP confidence to override the regex classifier (same-bucket). */
const NLP_OVERRIDE_THRESHOLD = 0.5

/** Intents that imply changing the sheet. */
const MUTATING_INTENTS = new Set<IntentType>([
  'write',
  'format',
  'create_chart',
  'create_formula',
  'filter',
  'sort',
  'clean',
  'export',
  'calculate',
])

/** Intents that imply analysis / explanation without mutation. */
const ANALYSIS_INTENTS = new Set<IntentType>([
  'read',
  'analyze',
  'summarize',
  'budget',
  'report',
  'compare',
  'find',
  'chat',
])

export function isCrossBucketIntentConflict(a: IntentType, b: IntentType): boolean {
  if (a === b || a === 'unknown' || b === 'unknown') return false
  const aMut = MUTATING_INTENTS.has(a)
  const bMut = MUTATING_INTENTS.has(b)
  const aAna = ANALYSIS_INTENTS.has(a)
  const bAna = ANALYSIS_INTENTS.has(b)
  return (aMut && bAna) || (aAna && bMut)
}

export function createIntentClassifierStage(): PipelineStage {
  return {
    name: 'intent-classifier',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const regexIntent = parseUserIntent(context.message)

      // Mode-pick chip wins over classifyMode so we do not re-clarify.
      if (context.resolvedMode) {
        context.mode = context.resolvedMode
      } else {
        context.mode = classifyMode(context.message)
      }

      const engine = getNLPEngine()
      let nlpIntentType: IntentType | undefined
      let nlpConfidence = 0

      if (engine.isReady && isBootstrapped()) {
        try {
          const nlpResult = await engine.classify(context.message, {
            workbookContext: buildWorkbookContext(context),
          })
          nlpIntentType = nlpResult.intentType
          nlpConfidence = nlpResult.confidence

          const skipConflictClarify = Boolean(context.resolvedMode)
          const bothConfident =
            regexIntent.confidence >= CONFLICT_CONFIDENCE
            && nlpConfidence >= CONFLICT_CONFIDENCE
          const crossBucket =
            nlpIntentType != null
            && isCrossBucketIntentConflict(regexIntent.intentType, nlpIntentType)

          if (!skipConflictClarify && bothConfident && crossBucket) {
            context.intent = regexIntent
            regexIntent.routingSource = 'regex'
            if (import.meta.env.DEV) {
              console.info(
                `[IntentClassifier] Conflict clarify: "${context.message.slice(0, 50)}" regex=${regexIntent.intentType}(${regexIntent.confidence}) nlp=${nlpIntentType}(${nlpConfidence})`,
              )
            }
            return {
              success: true,
              message: 'I can change the sheet or analyze it — which do you want?',
              suggestions: [
                modePickMessage('act', context.message),
                modePickMessage('explain', context.message),
              ],
              stageName: 'intent-classifier',
              metadata: {
                toolUsed: 'clarify',
                intentConflict: true,
                regexIntentType: regexIntent.intentType,
                nlpIntentType,
              },
            }
          }

          if (
            nlpConfidence >= NLP_OVERRIDE_THRESHOLD
            && nlpConfidence > regexIntent.confidence
            && nlpIntentType !== 'unknown'
          ) {
            if (import.meta.env.DEV) {
              console.info(
                `[IntentClassifier] NLP override: "${context.message.slice(0, 50)}" → ${nlpIntentType} (${nlpConfidence}) over regex ${regexIntent.intentType} (${regexIntent.confidence})`,
              )
            }
            regexIntent.intentType = nlpIntentType
            regexIntent.confidence = nlpConfidence
            regexIntent.routingSource = 'nlp'
            if (nlpResult.entities.length > 0 && regexIntent.targetColumns.length === 0) {
              regexIntent.entities = nlpResult.entities
            }
          } else {
            if (import.meta.env.DEV && nlpIntentType !== 'unknown') {
              console.info(
                `[IntentClassifier] Regex kept: "${context.message.slice(0, 50)}" → regex=${regexIntent.intentType}(${regexIntent.confidence}) nlp=${nlpIntentType}(${nlpConfidence})`,
              )
            }
            regexIntent.routingSource = 'regex'
          }
        } catch {
          regexIntent.routingSource = 'regex'
        }
      } else {
        regexIntent.routingSource = 'regex'
      }

      context.intent = regexIntent
      return null
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildWorkbookContext(context: PipelineContext) {
  const sheets = context.workbook.sheets.map((sheet) => {
    const columns: Array<{ letter: string; headerName: string; index: number }> = []
    if (sheet.cells) {
      for (let col = 0; col < 26; col++) {
        const letter = columnIndexToLetter(col)
        const cellId = `${letter}1`
        const cell = sheet.cells[cellId]
        if (cell && cell.value != null && cell.value !== '') {
          columns.push({ letter, headerName: String(cell.value), index: col })
        }
      }
    }

    return {
      id: sheet.id,
      name: sheet.name,
      columns,
    }
  })

  return {
    activeSheetId: context.sheet.id,
    sheets,
  }
}

function columnIndexToLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

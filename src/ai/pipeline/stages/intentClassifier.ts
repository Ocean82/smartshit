/**
 * IntentClassifier Stage — Enriches context with intent and mode classification.
 *
 * This stage NEVER claims the input — it always returns null.
 * Its sole purpose is to classify intent and mode, then attach the results
 * to the context for downstream stages to consume.
 *
 * Dual classification strategy:
 * 1. Always run regex-based parseUserIntent() for entity extraction (columns, sheets, rows, params)
 * 2. If NLP engine (MiniLM) is ready, run semantic classification for intent type
 * 3. If NLP confidence > regex confidence, override intentType with NLP result
 * 4. Mark routingSource ('nlp' | 'regex') on the intent for observability
 *
 * Fallback guarantee: if NLP engine is loading, unavailable, or produces low
 * confidence, the proven regex/keyword parser result is used unchanged.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import { parseUserIntent } from '@shared/intentParser'
import { classifyMode } from '@shared/mode'
import { getNLPEngine } from '@/ai/nlp/nlpEngine'
import { isBootstrapped } from '@/ai/nlp/intentEmbeddings'

/** Minimum NLP confidence to override the regex classifier */
const NLP_OVERRIDE_THRESHOLD = 0.5

export function createIntentClassifierStage(): PipelineStage {
  return {
    name: 'intent-classifier',

    async process(context: PipelineContext): Promise<StageResult | null> {
      // 1. Always run regex parser — provides entity extraction + baseline intent
      const regexIntent = parseUserIntent(context.message)

      // 2. Classify mode (explain/advise/act/help/chat) — independent of intent source
      context.mode = classifyMode(context.message)

      // 3. Attempt NLP classification if engine is ready and bootstrapped
      const engine = getNLPEngine()

      if (engine.isReady && isBootstrapped()) {
        try {
          const nlpResult = await engine.classify(context.message, {
            workbookContext: buildWorkbookContext(context),
          })

          // Override intent type if NLP is more confident
          if (
            nlpResult.confidence >= NLP_OVERRIDE_THRESHOLD &&
            nlpResult.confidence > regexIntent.confidence &&
            nlpResult.intentType !== 'unknown'
          ) {
            // Log classification decision for threshold tuning
            if (import.meta.env.DEV) {
              console.debug(
                `[IntentClassifier] NLP override: "${context.message.slice(0, 50)}" → ${nlpResult.intentType} (${nlpResult.confidence}) over regex ${regexIntent.intentType} (${regexIntent.confidence})`,
              )
            }

            regexIntent.intentType = nlpResult.intentType
            regexIntent.confidence = nlpResult.confidence
            regexIntent.routingSource = 'nlp'

            // Merge NLP entities if available and regex didn't find anything
            if (nlpResult.entities.length > 0 && regexIntent.targetColumns.length === 0) {
              regexIntent.entities = nlpResult.entities
            }
          } else {
            // Log when NLP was available but regex won (for threshold analysis)
            if (import.meta.env.DEV && nlpResult.intentType !== 'unknown') {
              console.debug(
                `[IntentClassifier] Regex kept: "${context.message.slice(0, 50)}" → regex=${regexIntent.intentType}(${regexIntent.confidence}) nlp=${nlpResult.intentType}(${nlpResult.confidence})`,
              )
            }
            regexIntent.routingSource = 'regex'
          }
        } catch {
          // NLP failure is non-fatal — use regex result as-is
          regexIntent.routingSource = 'regex'
        }
      } else {
        regexIntent.routingSource = 'regex'
      }

      // 4. Attach to context for downstream stages
      context.intent = regexIntent

      // Never claims — always enriches and passes
      return null
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a lightweight WorkbookContext from the pipeline context
 * for NLP entity resolution.
 */
function buildWorkbookContext(context: PipelineContext) {
  const sheets = context.workbook.sheets.map((sheet) => {
    // Extract column info from header row (row 1 in cell IDs = A1, B1, C1...)
    const columns: Array<{ letter: string; headerName: string; index: number }> = []
    if (sheet.cells) {
      // Scan columns A through Z (26 max for lightweight context)
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

/** Convert 0-based column index to letter (0→A, 1→B, ... 25→Z, 26→AA) */
function columnIndexToLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/**
 * IntentClassifier Stage — Enriches context with intent and mode classification.
 *
 * This stage NEVER claims the input — it always returns null.
 * Its sole purpose is to run the regex-based intent parser and mode classifier,
 * then attach the results to the context for downstream stages to consume.
 *
 * Uses the proven shared/intentParser.ts keyword-scoring approach.
 * NLP/WASM/embedding classification is explicitly deferred.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import { parseUserIntent } from '@shared/intentParser'
import { classifyMode } from '@shared/mode'

export function createIntentClassifierStage(): PipelineStage {
  return {
    name: 'intent-classifier',

    async process(context: PipelineContext): Promise<StageResult | null> {
      // Classify intent using the regex/keyword parser
      context.intent = parseUserIntent(context.message)

      // Classify mode (explain/advise/act/help/chat)
      context.mode = classifyMode(context.message)

      // Never claims — always enriches and passes
      return null
    },
  }
}

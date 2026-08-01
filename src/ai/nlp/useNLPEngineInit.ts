/**
 * React hook that initializes the NLP engine on application startup.
 *
 * This hook should be called once in the top-level App component. It:
 * - Starts NLP engine loading as a non-blocking background task
 * - Wires the engine initialization into the intent parser facade
 * - Ensures proper cleanup on unmount
 * - Uses bundled model on first load before CDN model is available
 * - Detects model updates on subsequent loads (handled inside nlpEngineInit)
 *
 * The hook does NOT block rendering — the engine loads asynchronously in a
 * Web Worker while the app remains fully interactive.
 *
 * @module useNLPEngineInit
 */

import { useEffect, useRef } from 'react'
import { initializeNLPEngine, DEFAULT_NLP_CONFIG } from './nlpEngineInit'
import { initializeNLPEngine as initializeIntentParserNLP } from '@/ai/intentParser'
import type { NLPConfig } from './types'
import type { UserIntent } from '@shared/intentTypes'

/**
 * Default LLM classifier stub.
 * In production this would call the server-side LLM via agentClient.
 * The stub returns an 'unknown' intent so the system falls through to regex.
 */
async function defaultLLMClassifier(_text: string): Promise<UserIntent> {
  return {
    intentType: 'unknown',
    targetColumns: [],
    filters: {},
    parameters: {},
    rawQuery: _text,
    confidence: 0,
    routingSource: 'llm',
  }
}

/**
 * Initializes the NLP engine as a background task on mount.
 *
 * @param config - Optional partial config override (merged with defaults)
 * @param llmClassifier - Optional server-side LLM classifier for hybrid routing
 */
export function useNLPEngineInit(
  config?: Partial<NLPConfig>,
  llmClassifier?: (text: string) => Promise<UserIntent>,
): void {
  const initializedRef = useRef(false)

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initializedRef.current) return
    initializedRef.current = true

    const mergedConfig: NLPConfig = { ...DEFAULT_NLP_CONFIG, ...config }
    const classifier = llmClassifier ?? defaultLLMClassifier

    // 1. Initialize the NLP engine singleton (non-blocking, starts worker in background)
    //    This creates the Web Worker and begins loading the bundled/cached model.
    initializeNLPEngine(mergedConfig)

    // 2. Wire the intent parser facade to use the NLP engine for classification routing.
    //    This connects the hybrid router so parseUserIntentAsync() can use NLP when ready.
    const disposeIntentParser = initializeIntentParserNLP(mergedConfig, classifier)

    return () => {
      disposeIntentParser()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

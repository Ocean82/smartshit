/**
 * React hook for observing NLP Engine state.
 *
 * Exposes the loading/ready/fallback/updating state of the NLP engine
 * to UI components via React's useSyncExternalStore pattern.
 *
 * @module useNLPEngineState
 */

import { useSyncExternalStore } from 'react'
import type { NLPEngineState } from './types'
import {
  getNLPEngineState,
  onNLPEngineStateChange,
} from './nlpEngineInit'

/**
 * Subscribes to NLP engine state changes using useSyncExternalStore.
 * Returns the current NLPEngineState ('loading' | 'ready' | 'fallback' | 'updating').
 *
 * Usage:
 * ```tsx
 * function StatusIndicator() {
 *   const nlpState = useNLPEngineState()
 *   return <span>{nlpState}</span>
 * }
 * ```
 */
export function useNLPEngineState(): NLPEngineState {
  return useSyncExternalStore(
    onNLPEngineStateChange,
    getNLPEngineState,
    // Server snapshot — always 'loading' in SSR context
    () => 'loading' as NLPEngineState,
  )
}

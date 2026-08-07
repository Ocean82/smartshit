/**
 * Intent Parser — Thin re-export of the shared regex-based parser.
 *
 * This module exists for backward compatibility: brain.ts, useStore.ts, and
 * other consumers import from '@/ai/intentParser'. All functionality delegates
 * to the shared/intentParser.ts regex keyword-scoring implementation.
 *
 * The NLP/WASM hybrid routing that previously lived here has been removed
 * as part of the intent system unification (see architecture_selection.md).
 * When NLP is re-enabled in the future, it will be integrated as a pipeline
 * stage rather than a facade routing layer.
 */

export { parseUserIntent, isQueryIntent, serializeIntent, deserializeIntent } from '@shared/intentParser'
export type { UserIntent, IntentType } from '@shared/intentTypes'

/**
 * NLP Module — Public API
 *
 * Exports the high-level engine interface for intent classification
 * using MiniLM sentence embeddings.
 */

export { NLPEngine, getNLPEngine, setNLPEngine } from './nlpEngine'
export type { NLPClassifyOptions, NLPEngineStatus } from './nlpEngine'
export { NLPWorkerBridge } from './nlpBridge'
export type { NLPBridgeOptions } from './nlpBridge'
export { WordPieceTokenizer } from './tokenizer'
export type { TokenizerOutput, TokenizerConfig, TokenizerJsonFormat } from './tokenizer'
export { INTENT_PHRASES, EMBEDDING_DIM, isBootstrapped } from './intentEmbeddings'
export type { IntentEmbeddingEntry } from './intentEmbeddings'
export { classifyIntent } from './intentClassifier'
export { extractEntities } from './entityExtractor'
export type {
  NLPEngineState,
  NLPConfig,
  ClassificationResult,
  Entity,
  WorkbookContext,
  NLPError,
} from './types'

/**
 * Intent Embeddings — Reference Vectors for Semantic Classification
 *
 * Provides pre-defined representative phrases for each intent type.
 * On first engine initialization, these phrases are embedded via MiniLM
 * and the resulting vectors are cached as the reference set for cosine
 * similarity matching.
 *
 * Until bootstrap completes, the module exports placeholder zero vectors
 * so the engine falls back to the keyword classifier gracefully.
 *
 * Architecture:
 * - Each intent has 3–5 representative phrases (natural language, not keywords)
 * - After bootstrap, each intent is represented by the mean of its phrase embeddings
 * - The mean vectors are L2-normalized for efficient dot-product similarity
 */

import type { IntentType } from '@shared/intentTypes'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IntentEmbeddingEntry {
  intentType: IntentType
  embedding: Float32Array
  /** Representative phrases used to compute this embedding */
  phrases: string[]
}

// ─── Embedding Dimension ────────────────────────────────────────────────────

/** MiniLM hidden size / embedding dimension */
export const EMBEDDING_DIM = 384

// ─── Representative Phrases ─────────────────────────────────────────────────

/**
 * Natural language phrases that represent each intent.
 * These are what users might actually type — diverse phrasing improves
 * the robustness of the mean embedding for each intent cluster.
 *
 * Guidelines for phrases:
 * - Use full natural sentences/commands (not single keywords)
 * - Cover different phrasings of the same intent
 * - Include casual/informal variants real users would type
 * - 3–5 phrases per intent is sufficient for MiniLM discrimination
 */
export const INTENT_PHRASES: Record<IntentType, string[]> = {
  read: [
    'show me the data in column B',
    'display the values in this range',
    'what does cell A1 contain',
    'let me see the contents of this sheet',
    'open the expenses sheet',
  ],
  analyze: [
    'analyze the spending trends over time',
    'examine the data for patterns',
    'what insights can you find in this data',
    'investigate the revenue numbers',
    'assess the financial performance',
  ],
  write: [
    'enter the value 500 in cell B3',
    'update the name in row 5',
    'change the price to 29.99',
    'put the total in the last row',
    'edit the description field',
  ],
  format: [
    'make the header row bold',
    'change the font color to red',
    'apply currency formatting to column C',
    'highlight the cells with values over 1000',
    'align the text to center',
  ],
  create_chart: [
    'create a bar chart from column A and B',
    'make a pie chart showing expenses by category',
    'visualize the monthly revenue as a line graph',
    'plot the data as a chart',
    'show me a graph of sales over time',
  ],
  create_formula: [
    'add a SUM formula for the total',
    'write a VLOOKUP to find the price',
    'create a formula to calculate the average',
    'insert a COUNTIF for values greater than 100',
    'build an IF formula for the status column',
  ],
  summarize: [
    'give me a summary of the spreadsheet',
    'provide an overview of the expenses',
    'summarize the key findings from this data',
    'what are the main takeaways',
    'condense this data into highlights',
  ],
  filter: [
    'filter rows where amount is greater than 500',
    'show only the entries from January',
    'hide rows with empty values',
    'narrow down to just marketing expenses',
    'only show completed items',
  ],
  sort: [
    'sort the data by date in descending order',
    'arrange rows alphabetically by name',
    'order the expenses from highest to lowest',
    'rank the items by their score',
    'organize by category then by amount',
  ],
  clean: [
    'remove all duplicate rows',
    'clean up the empty cells',
    'delete rows with missing data',
    'trim the whitespace from all cells',
    'deduplicate the email column',
  ],
  budget: [
    'help me set up a monthly budget',
    'track my expenses for this month',
    'show my income vs spending',
    'create a budget plan for the quarter',
    'how much did I spend on groceries',
  ],
  report: [
    'generate a monthly expense report',
    'create a report of all transactions',
    'compile the sales data into a document',
    'produce a summary report for the team',
    'build a quarterly financial report',
  ],
  compare: [
    'compare this month to last month',
    'what is the difference between Q1 and Q2',
    'show the changes between these two columns',
    'contrast the budget vs actual spending',
    'how do these numbers stack up side by side',
  ],
  find: [
    'find all cells containing the word error',
    'search for duplicate entries',
    'locate the highest value in column D',
    'where is the entry for John Smith',
    'identify all negative numbers',
  ],
  calculate: [
    'calculate the total for this column',
    'what is the average of these values',
    'compute the sum of row 3',
    'add up all the expenses',
    'multiply column A by column B',
  ],
  export: [
    'export this sheet as a CSV file',
    'download the data as PDF',
    'save this as an Excel file',
    'convert the report to PDF format',
    'output the results to a spreadsheet',
  ],
  chat: [
    'hello how are you',
    'what can you help me with',
    'explain how formulas work',
    'tell me about this spreadsheet app',
    'I have a question about my data',
  ],
  unknown: [],
}

// ─── Mutable Embeddings Store ───────────────────────────────────────────────

/**
 * The computed intent embeddings. Initially empty (zero vectors).
 * Populated by loadPrecomputedEmbeddings() (instant) or bootstrapIntentEmbeddings() (slow fallback).
 */
export let INTENT_EMBEDDINGS: IntentEmbeddingEntry[] = buildPlaceholders()

/** Whether bootstrap has completed (either from pre-computed file or runtime computation) */
let _bootstrapped = false

export function isBootstrapped(): boolean {
  return _bootstrapped
}

/**
 * Build placeholder entries with zero vectors.
 * Used before bootstrap completes — cosine similarity with zero vectors
 * yields 0, causing the engine to fall back to keyword classification.
 */
function buildPlaceholders(): IntentEmbeddingEntry[] {
  const entries: IntentEmbeddingEntry[] = []

  for (const [intentType, phrases] of Object.entries(INTENT_PHRASES)) {
    if (intentType === 'unknown' || phrases.length === 0) continue

    entries.push({
      intentType: intentType as IntentType,
      embedding: new Float32Array(EMBEDDING_DIM), // Zero vector
      phrases,
    })
  }

  return entries
}

// ─── Pre-computed Loading (Fast Path) ───────────────────────────────────────

/** URL for the pre-computed intent vectors binary */
const INTENT_VECTORS_URL = '/models/minilm/intent-vectors.bin'

/**
 * Load pre-computed intent embeddings from a binary file.
 * This is the fast path — loads in <10ms vs 2-4s for runtime computation.
 *
 * Binary format:
 *   [version: u32][numIntents: u32][dim: u32]
 *   [name: 32 bytes utf8][numPhrases: u32] × numIntents
 *   [embedding: float32 × dim] × numIntents
 *
 * @returns true if loaded successfully, false if file not available
 */
export async function loadPrecomputedEmbeddings(): Promise<boolean> {
  if (_bootstrapped) return true

  try {
    const response = await fetch(INTENT_VECTORS_URL)
    if (!response.ok) return false

    const buffer = await response.arrayBuffer()
    const view = new DataView(buffer)

    // Read header
    const version = view.getUint32(0, true)
    if (version !== 1) return false

    const numIntents = view.getUint32(4, true)
    const dim = view.getUint32(8, true)
    if (dim !== EMBEDDING_DIM) return false

    let offset = 12
    const entries: IntentEmbeddingEntry[] = []

    // Read per-intent headers
    const intentMeta: Array<{ name: string; numPhrases: number }> = []
    for (let i = 0; i < numIntents; i++) {
      const nameBytes = new Uint8Array(buffer, offset, 32)
      const name = new TextDecoder().decode(nameBytes).replace(/\0+$/, '')
      offset += 32
      const numPhrases = view.getUint32(offset, true)
      offset += 4
      intentMeta.push({ name, numPhrases })
    }

    // Read embeddings
    for (let i = 0; i < numIntents; i++) {
      const embedding = new Float32Array(dim)
      for (let d = 0; d < dim; d++) {
        embedding[d] = view.getFloat32(offset, true)
        offset += 4
      }

      const intentType = intentMeta[i].name as IntentType
      const phrases = INTENT_PHRASES[intentType] ?? []

      entries.push({ intentType, embedding, phrases })
    }

    if (entries.length > 0) {
      INTENT_EMBEDDINGS = entries
      _bootstrapped = true
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Bootstrap the intent embeddings by computing MiniLM embeddings for
 * all representative phrases. Called once after the NLP engine becomes ready.
 *
 * @param embedFn - Function that computes a 384-dim embedding for a text string.
 *                  This is the NLPWorkerBridge.embed() result's rawEmbedding.
 */
export async function bootstrapIntentEmbeddings(
  embedFn: (text: string) => Promise<Float32Array | null>,
): Promise<void> {
  if (_bootstrapped) return

  const entries: IntentEmbeddingEntry[] = []

  for (const [intentType, phrases] of Object.entries(INTENT_PHRASES)) {
    if (intentType === 'unknown' || phrases.length === 0) continue

    // Compute embeddings for all phrases
    const phraseEmbeddings: Float32Array[] = []

    for (const phrase of phrases) {
      const embedding = await embedFn(phrase)
      if (embedding && embedding.length === EMBEDDING_DIM) {
        phraseEmbeddings.push(embedding)
      }
    }

    if (phraseEmbeddings.length === 0) {
      // No successful embeddings — skip this intent
      continue
    }

    // Mean pool all phrase embeddings into one representative vector
    const meanEmbedding = new Float32Array(EMBEDDING_DIM)
    for (const emb of phraseEmbeddings) {
      for (let d = 0; d < EMBEDDING_DIM; d++) {
        meanEmbedding[d] += emb[d]
      }
    }
    for (let d = 0; d < EMBEDDING_DIM; d++) {
      meanEmbedding[d] /= phraseEmbeddings.length
    }

    // L2 normalize the mean embedding
    let norm = 0
    for (let d = 0; d < EMBEDDING_DIM; d++) {
      norm += meanEmbedding[d] * meanEmbedding[d]
    }
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let d = 0; d < EMBEDDING_DIM; d++) {
        meanEmbedding[d] /= norm
      }
    }

    entries.push({
      intentType: intentType as IntentType,
      embedding: meanEmbedding,
      phrases,
    })
  }

  if (entries.length > 0) {
    INTENT_EMBEDDINGS = entries
    _bootstrapped = true
  }
}

/**
 * Reset embeddings to placeholders (for testing).
 */
export function resetIntentEmbeddings(): void {
  INTENT_EMBEDDINGS = buildPlaceholders()
  _bootstrapped = false
}

/**
 * Bootstrap from a cached set of intent embeddings (from IndexedDB).
 * Faster than runtime computation since no inference is needed.
 */
export function bootstrapFromCache(
  cached: Array<{ name: string; embedding: Float32Array }>,
): void {
  if (_bootstrapped) return

  const entries: IntentEmbeddingEntry[] = []
  for (const { name, embedding } of cached) {
    const intentType = name as IntentType
    const phrases = INTENT_PHRASES[intentType] ?? []
    if (phrases.length === 0) continue
    entries.push({ intentType, embedding, phrases })
  }

  if (entries.length > 0) {
    INTENT_EMBEDDINGS = entries
    _bootstrapped = true
  }
}

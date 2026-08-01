/**
 * Intent Classifier
 *
 * Embedding-based intent classification with typo tolerance via Levenshtein
 * pre-processing and cosine similarity matching against pre-computed
 * Intent_Vocabulary embeddings.
 *
 * Pure-logic module — no DOM, no Worker APIs. Synchronous and fast.
 * Target: <50ms classification for inputs up to 200 chars.
 */

import type { IntentType } from '@shared/intentTypes'
import type { ClassificationResult, WorkbookContext } from './types'

// ─── Intent Vocabulary ──────────────────────────────────────────────────────

/**
 * Canonical keywords/phrases for each intent type.
 * Used for both typo correction (vocabulary list) and embedding computation.
 */
const INTENT_VOCABULARY: Record<IntentType, string[]> = {
  read: ['read', 'show', 'display', 'view', 'open', 'look', 'see', 'get', 'fetch'],
  analyze: ['analyze', 'analysis', 'examine', 'inspect', 'investigate', 'study', 'assess', 'evaluate'],
  write: ['write', 'edit', 'update', 'change', 'modify', 'set', 'put', 'enter', 'input', 'type'],
  format: ['format', 'style', 'color', 'bold', 'italic', 'underline', 'font', 'highlight', 'align', 'theme'],
  create_chart: ['chart', 'graph', 'plot', 'visualize', 'visualization', 'diagram', 'bar', 'pie', 'line chart'],
  create_formula: ['formula', 'equation', 'function', 'vlookup', 'sumif', 'countif', 'expression'],
  summarize: ['summarize', 'summary', 'overview', 'recap', 'digest', 'brief', 'condense', 'outline'],
  filter: ['filter', 'where', 'condition', 'criteria', 'subset', 'narrow', 'include', 'exclude', 'only'],
  sort: ['sort', 'order', 'arrange', 'rank', 'ascending', 'descending', 'alphabetical', 'organize'],
  clean: ['clean', 'remove', 'delete', 'trim', 'strip', 'deduplicate', 'fix', 'clear', 'empty', 'wipe'],
  budget: ['budget', 'expense', 'income', 'spending', 'cost', 'revenue', 'profit', 'loss', 'financial'],
  report: ['report', 'generate', 'create report', 'document', 'compile', 'produce', 'build report'],
  compare: ['compare', 'difference', 'diff', 'versus', 'contrast', 'match', 'side by side'],
  find: ['find', 'search', 'locate', 'lookup', 'seek', 'discover', 'identify', 'detect', 'spot', 'duplicate', 'duplicates'],
  calculate: ['calculate', 'compute', 'sum', 'total', 'average', 'mean', 'count', 'add', 'subtract', 'multiply'],
  export: ['export', 'download', 'save as', 'convert', 'pdf', 'csv', 'excel', 'output'],
  chat: ['chat', 'talk', 'hello', 'help', 'question', 'explain', 'tell me', 'what is', 'how to'],
  unknown: [],
}

// ─── Pre-computed Embeddings ────────────────────────────────────────────────

/**
 * Hybrid embedding approach:
 * 1. Each intent has a dedicated dimension per keyword (exact word match signal)
 * 2. Plus character trigram features for fuzzy matching
 *
 * This gives strong keyword-based discrimination while still supporting
 * similarity for novel phrasings via trigrams.
 */

// Build a global keyword → intent index for the keyword dimensions
const KEYWORD_INDEX: Map<string, number> = new Map()
let nextKeywordIdx = 0
for (const keywords of Object.values(INTENT_VOCABULARY)) {
  for (const kw of keywords) {
    if (!KEYWORD_INDEX.has(kw)) {
      KEYWORD_INDEX.set(kw, nextKeywordIdx++)
    }
  }
}

const TRIGRAM_DIM = 128
const KEYWORD_DIM = KEYWORD_INDEX.size
const EMBEDDING_DIM = KEYWORD_DIM + TRIGRAM_DIM

/** Extract character trigrams from a string */
function extractTrigrams(text: string): Map<string, number> {
  const trigrams = new Map<string, number>()
  const padded = `  ${text.toLowerCase()}  `
  for (let i = 0; i < padded.length - 2; i++) {
    const tri = padded.slice(i, i + 3)
    trigrams.set(tri, (trigrams.get(tri) || 0) + 1)
  }
  return trigrams
}

/** Hash a trigram string to a dimension index (deterministic) */
function trigramHash(trigram: string): number {
  let hash = 0
  for (let i = 0; i < trigram.length; i++) {
    hash = ((hash << 5) - hash + trigram.charCodeAt(i)) | 0
  }
  return ((hash % TRIGRAM_DIM) + TRIGRAM_DIM) % TRIGRAM_DIM
}

/**
 * Compute a fixed-dimension embedding vector from text.
 * The vector is structured as: [keyword_features | trigram_features]
 * - keyword_features: one dimension per known keyword, value = weighted by position
 * - trigram_features: character trigram hash buckets for fuzzy matching
 *
 * Earlier words (especially the first verb/action word) receive higher weight.
 * This reflects that in natural language commands, the action word typically
 * comes first: "filter rows", "sort by date", "find duplicates".
 */
function computeEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0)
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0)

  // Keyword dimensions with positional weighting
  // First recognized keyword gets 5x weight, subsequent get 2x
  const BASE_KEYWORD_WEIGHT = 2.0
  const FIRST_KEYWORD_BOOST = 5.0
  let firstKeywordFound = false

  for (const word of words) {
    const idx = KEYWORD_INDEX.get(word)
    if (idx !== undefined) {
      const weight = !firstKeywordFound ? FIRST_KEYWORD_BOOST : BASE_KEYWORD_WEIGHT
      vec[idx] += weight
      firstKeywordFound = true
    }
  }

  // Trigram dimensions (fuzzy matching)
  const trigrams = extractTrigrams(text)
  for (const [tri, count] of trigrams) {
    const idx = KEYWORD_DIM + trigramHash(tri)
    vec[idx] += count
  }

  // L2-normalize the vector
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  if (magnitude > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= magnitude
    }
  }

  return vec
}

/** Pre-computed intent embeddings (computed once at module load) */
const INTENT_EMBEDDINGS: Map<IntentType, number[]> = new Map()

// Compute embedding for each intent by combining all its keywords
for (const [intent, keywords] of Object.entries(INTENT_VOCABULARY) as Array<[IntentType, string[]]>) {
  if (keywords.length === 0) continue
  const combinedText = keywords.join(' ')
  INTENT_EMBEDDINGS.set(intent, computeEmbedding(combinedText))
}

/** Flat list of all vocabulary words for typo correction */
const ALL_VOCABULARY_WORDS: string[] = Object.values(INTENT_VOCABULARY).flat()

// ─── Levenshtein Distance ───────────────────────────────────────────────────

/**
 * Compute the Levenshtein (edit) distance between two strings.
 * Uses the standard dynamic programming approach with O(min(m,n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  const aLen = a.length
  const bLen = b.length

  // Use two rows instead of full matrix
  let prevRow = new Array<number>(aLen + 1)
  let currRow = new Array<number>(aLen + 1)

  // Initialize first row
  for (let j = 0; j <= aLen; j++) {
    prevRow[j] = j
  }

  for (let i = 1; i <= bLen; i++) {
    currRow[0] = i

    for (let j = 1; j <= aLen; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      currRow[j] = Math.min(
        currRow[j - 1] + 1,       // insertion
        prevRow[j] + 1,           // deletion
        prevRow[j - 1] + cost     // substitution
      )
    }

    // Swap rows
    const temp = prevRow
    prevRow = currRow
    currRow = temp
  }

  return prevRow[aLen]
}

// ─── Typo Correction ────────────────────────────────────────────────────────

/**
 * Correct typos in text by replacing words (≥4 chars) that are within
 * 2 Levenshtein edits of a known vocabulary word.
 *
 * @param text - Input text to correct
 * @param vocabulary - List of known correct words
 * @returns Text with corrected words
 */
export function correctTypos(text: string, vocabulary: string[]): string {
  const words = text.split(/\s+/).filter(w => w.length > 0)

  const corrected = words.map(word => {
    // Only correct words with 4+ characters
    if (word.length < 4) return word

    const lowerWord = word.toLowerCase()

    // If the word is already in vocabulary, no correction needed
    if (vocabulary.includes(lowerWord)) return word

    let bestMatch = word
    let bestDistance = 3 // Only accept distance ≤ 2

    for (const vocabWord of vocabulary) {
      // Quick length check to skip obvious non-matches
      if (Math.abs(vocabWord.length - lowerWord.length) > 2) continue

      const dist = levenshteinDistance(lowerWord, vocabWord)
      if (dist < bestDistance) {
        bestDistance = dist
        bestMatch = vocabWord
      }
      // Early exit on perfect match after correction
      if (dist === 1) break
    }

    return bestDistance <= 2 ? bestMatch : word
  })

  return corrected.join(' ')
}

// ─── Cosine Similarity ──────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1]. For our use case, vectors are non-negative
 * so result is in [0, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magnitudeA += a[i] * a[i]
    magnitudeB += b[i] * b[i]
  }

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

// ─── Intent Classification ──────────────────────────────────────────────────

/**
 * Classify user input text into an intent type using embedding-based
 * cosine similarity matching.
 *
 * Pipeline:
 * 1. Preprocess: trim, lowercase
 * 2. Handle empty/whitespace → return unknown with confidence 0
 * 3. Apply Levenshtein typo correction (words ≥4 chars, distance ≤2)
 * 4. Compute embedding of corrected text
 * 5. Find highest cosine similarity against intent vocabulary embeddings
 * 6. Return best match with confidence score
 *
 * @param text - User input text
 * @param _workbookContext - Optional workbook context (reserved for future entity resolution)
 * @returns ClassificationResult with intentType and confidence
 */
export function classifyIntent(
  text: string,
  _workbookContext?: WorkbookContext
): ClassificationResult {
  // Step 1: Preprocess
  const trimmed = text.trim()

  // Step 2: Handle empty/whitespace input
  if (trimmed.length === 0) {
    return {
      intentType: 'unknown',
      confidence: 0,
      entities: [],
      isMultiStep: false,
    }
  }

  const lowered = trimmed.toLowerCase()

  // Step 3: Typo correction
  const corrected = correctTypos(lowered, ALL_VOCABULARY_WORDS)

  // Step 4: Compute input embedding
  const inputEmbedding = computeEmbedding(corrected)

  // Step 5: Find best matching intent via cosine similarity
  let bestIntent: IntentType = 'unknown'
  let bestScore = -1

  for (const [intent, embedding] of INTENT_EMBEDDINGS) {
    const score = cosineSimilarity(inputEmbedding, embedding)
    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
    }
  }

  // Step 6: Apply confidence threshold
  // If best confidence < 0.1, return unknown
  if (bestScore < 0.1) {
    return {
      intentType: 'unknown',
      confidence: 0,
      entities: [],
      isMultiStep: false,
    }
  }

  // Normalize confidence to [0, 1] and round to 2 decimal places
  const confidence = Math.round(Math.min(1, Math.max(0, bestScore)) * 100) / 100

  return {
    intentType: bestIntent,
    confidence,
    entities: [],
    isMultiStep: false,
  }
}

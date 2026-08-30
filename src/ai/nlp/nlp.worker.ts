/**
 * NLP Web Worker — MiniLM Sentence Embedding Inference
 *
 * Dedicated Web Worker that loads the all-MiniLM-L6-v2 ONNX model and
 * produces 384-dimensional sentence embeddings for intent classification.
 *
 * Bundle size: ~2-3MB (onnxruntime-web WASM runtime).
 * This chunk is code-split by Vite and only downloaded when the worker
 * is first instantiated (on first chat message, not on page load).
 * After first load, the Service Worker caches it for instant subsequent use.
 *
 * Message protocol follows NLPWorkerRequest/NLPWorkerResponse from ./types.ts.
 *
 * Pipeline per classify request:
 * 1. Tokenize text using WordPiece tokenizer
 * 2. Run ONNX inference (input_ids, attention_mask, token_type_ids → last_hidden_state)
 * 3. Mean-pool the token embeddings (masked by attention) → 384-dim vector
 * 4. Return the embedding to the main thread
 */

import * as ort from 'onnxruntime-web'
import { WordPieceTokenizer, type TokenizerJsonFormat } from './tokenizer'
import type { NLPWorkerRequest, NLPWorkerResponse, NLPEngineState } from './types'

// ─── State ──────────────────────────────────────────────────────────────────

let session: ort.InferenceSession | null = null
let tokenizer: WordPieceTokenizer | null = null

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Initialize: fetch tokenizer.json + model.onnx, create session.
 */
async function handleInit(modelUrl: string): Promise<void> {
  postState('loading')

  try {
    // Resolve base URL (modelUrl points to the directory)
    const baseUrl = modelUrl.endsWith('/') ? modelUrl : `${modelUrl}/`

    // Load tokenizer
    const tokenizerResponse = await fetch(`${baseUrl}tokenizer.json`)
    if (!tokenizerResponse.ok) {
      throw new Error(`Failed to fetch tokenizer.json: ${tokenizerResponse.status}`)
    }
    const tokenizerJson: TokenizerJsonFormat = await tokenizerResponse.json()

    tokenizer = new WordPieceTokenizer()
    tokenizer.loadFromTokenizerJson(tokenizerJson)

    // Load ONNX model
    const modelResponse = await fetch(`${baseUrl}model.onnx`)
    if (!modelResponse.ok) {
      throw new Error(`Failed to fetch model.onnx: ${modelResponse.status}`)
    }
    const modelBuffer = await modelResponse.arrayBuffer()

    session = await ort.InferenceSession.create(
      new Uint8Array(modelBuffer),
      {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        // onnxruntime-web can use multi-threaded WASM with SharedArrayBuffer.
        // This requires COOP/COEP headers on the server:
        //   Cross-Origin-Embedder-Policy: require-corp
        //   Cross-Origin-Opener-Policy: same-origin
        // When headers aren't set, it falls back to single-threaded WASM (fine for MiniLM).
        // Explicitly set numThreads=1 to avoid console warnings about missing headers.
        interOpNumThreads: 1,
        intraOpNumThreads: 1,
      }
    )

    // Validate that model has expected input names (prevents silent failures)
    const expectedInputs = ['input_ids', 'attention_mask', 'token_type_ids']
    const actualInputs = session.inputNames
    const missing = expectedInputs.filter((name) => !actualInputs.includes(name))
    if (missing.length > 0) {
      throw new Error(
        `Model input mismatch: expected [${expectedInputs.join(', ')}], ` +
        `got [${actualInputs.join(', ')}]. Missing: ${missing.join(', ')}`,
      )
    }

    postState('ready')
  } catch (error) {
    postState('fallback')
    const message = error instanceof Error ? error.message : String(error)
    postError('__init__', message)
  }
}

/**
 * Classify: tokenize text → run inference → mean-pool → return embedding.
 */
async function handleClassify(id: string, text: string): Promise<void> {
  if (!session || !tokenizer) {
    postError(id, 'Engine not initialized')
    return
  }

  try {
    // 1. Tokenize
    const encoded = tokenizer.encode(text)

    // 2. Create ONNX tensors
    const inputIdsTensor = new ort.Tensor('int64', encoded.inputIds, [1, 128])
    const attentionMaskTensor = new ort.Tensor('int64', encoded.attentionMask, [1, 128])
    const tokenTypeIdsTensor = new ort.Tensor('int64', encoded.tokenTypeIds, [1, 128])

    // 3. Run inference
    const feeds: Record<string, ort.Tensor> = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    }

    const results = await session.run(feeds)

    // 4. Extract output — MiniLM outputs last_hidden_state [1, 128, 384]
    const outputName = session.outputNames[0]
    const output = results[outputName]
    const outputData = output.data as Float32Array
    const hiddenSize = 384

    // 5. Mean pooling with attention mask
    const embedding = meanPool(outputData, encoded.attentionMask, 128, hiddenSize)

    // 6. L2 normalize the embedding
    l2Normalize(embedding)

    // 7. Transfer the embedding back to main thread
    const response: NLPWorkerResponse = {
      type: 'classifyResult',
      id,
      result: {
        intentType: 'unknown', // Classification happens on main thread via cosine similarity
        confidence: 0,
        entities: [],
        isMultiStep: false,
        rawEmbedding: embedding,
      },
    }

    self.postMessage(response, { transfer: [embedding.buffer] })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    postError(id, message)
  }
}

/**
 * Update model: re-load with new model URL (hot-swap without full page reload).
 */
async function handleUpdateModel(modelUrl: string): Promise<void> {
  postState('updating')

  // Dispose existing session
  if (session) {
    try {
      await session.release()
    } catch {
      // Best effort cleanup
    }
    session = null
  }

  // Re-initialize
  await handleInit(modelUrl)
}

// ─── Mean Pooling ───────────────────────────────────────────────────────────

/**
 * Mean pooling: average token embeddings weighted by attention mask.
 * Produces a single [hiddenSize] vector from [seqLen, hiddenSize] output.
 *
 * @param hiddenStates - Flat Float32Array of shape [1, seqLen, hiddenSize]
 * @param attentionMask - BigInt64Array of shape [seqLen], 1n for real tokens, 0n for padding
 * @param seqLen - Sequence length (128)
 * @param hiddenSize - Hidden dimension size (384)
 * @returns Float32Array of shape [hiddenSize]
 */
function meanPool(
  hiddenStates: Float32Array,
  attentionMask: BigInt64Array,
  seqLen: number,
  hiddenSize: number,
): Float32Array {
  const pooled = new Float32Array(hiddenSize)
  let tokenCount = 0

  for (let t = 0; t < seqLen; t++) {
    if (attentionMask[t] === 0n) continue
    tokenCount++

    const offset = t * hiddenSize
    for (let d = 0; d < hiddenSize; d++) {
      pooled[d] += hiddenStates[offset + d]
    }
  }

  if (tokenCount > 0) {
    for (let d = 0; d < hiddenSize; d++) {
      pooled[d] /= tokenCount
    }
  }

  return pooled
}

/**
 * In-place L2 normalization of a vector.
 */
function l2Normalize(vec: Float32Array): void {
  let norm = 0
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i]
  }
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm
    }
  }
}

// ─── Message Helpers ────────────────────────────────────────────────────────

function postState(state: NLPEngineState): void {
  const response: NLPWorkerResponse = { type: 'stateChange', state }
  self.postMessage(response)
}

function postError(id: string, message: string): void {
  const response: NLPWorkerResponse = { type: 'error', id, error: message }
  self.postMessage(response)
}

// ─── Message Handler ────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<NLPWorkerRequest>) => {
  const msg = event.data

  switch (msg.type) {
    case 'init':
      await handleInit(msg.modelUrl)
      break

    case 'classify':
      await handleClassify(msg.id, msg.text)
      break

    case 'planMacro':
      // Macro planning reuses classification — main thread decomposes
      await handleClassify(msg.id, msg.text)
      break

    case 'updateModel':
      await handleUpdateModel(msg.modelUrl)
      break

    case 'cancel':
      // Currently inference is non-cancellable (fast enough at <50ms)
      // Acknowledge by doing nothing — the main thread will ignore the result
      break

    default:
      postError('__unknown__', `Unknown message type: ${(msg as { type: string }).type}`)
  }
}

// Signal that worker script loaded successfully
postState('loading')

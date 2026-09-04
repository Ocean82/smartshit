#!/usr/bin/env node
/**
 * Pre-compute Intent Embeddings
 *
 * Runs the MiniLM ONNX model (via onnxruntime-node) against all intent
 * reference phrases and writes the resulting vectors to a binary file
 * that the client loads at runtime — eliminating the 2-4s bootstrap delay.
 *
 * Output: public/models/minilm/intent-vectors.bin
 *   Format: [header][embeddings]
 *   Header: 4 bytes version (uint32) + 4 bytes numIntents (uint32) + 4 bytes dim (uint32)
 *           + for each intent: 32 bytes name (utf8, null-padded) + 4 bytes numPhrases (uint32)
 *   Embeddings: numIntents × dim × float32 (the mean-pooled, L2-normalized vector per intent)
 *
 * Usage:
 *   node scripts/precompute-embeddings.mjs
 *
 * Requirements:
 *   - onnxruntime-node (installed in server/node_modules or root)
 *   - MiniLM model at server/models/minilm/model.onnx (full or quantized)
 *   - tokenizer.json alongside the model
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Intent phrases — single source of truth (shared/intentPhrases.js). Imported
// so the precomputed vectors can never drift from the runtime phrase set.
import { INTENT_PHRASES, intentPhrasesHash } from '../shared/intentPhrases.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// ─── Lightweight WordPiece Tokenizer ────────────────────────────────────────

class WordPieceTokenizer {
  constructor(vocab) {
    this.vocab = vocab
  }

  encode(text) {
    const normalized = text.toLowerCase().trim()
    const words = this.preTokenize(normalized)
    const tokenIds = []
    const maxTokens = 126 // 128 - 2 for [CLS] and [SEP]

    for (const word of words) {
      if (tokenIds.length >= maxTokens) break
      const wordTokens = this.tokenizeWord(word)
      for (const id of wordTokens) {
        if (tokenIds.length >= maxTokens) break
        tokenIds.push(id)
      }
    }

    // Build [CLS] + tokens + [SEP] + padding to 128
    const inputIds = new BigInt64Array(128)
    const attentionMask = new BigInt64Array(128)
    const tokenTypeIds = new BigInt64Array(128)

    inputIds[0] = 101n // [CLS]
    attentionMask[0] = 1n
    for (let i = 0; i < tokenIds.length; i++) {
      inputIds[i + 1] = BigInt(tokenIds[i])
      attentionMask[i + 1] = 1n
    }
    inputIds[tokenIds.length + 1] = 102n // [SEP]
    attentionMask[tokenIds.length + 1] = 1n

    return { inputIds, attentionMask, tokenTypeIds }
  }

  preTokenize(text) {
    const tokens = []
    let current = ''
    for (const char of text) {
      const cp = char.codePointAt(0)
      if (cp === 0x20 || cp === 0x09 || cp === 0x0A || cp === 0x0D) {
        if (current) { tokens.push(current); current = '' }
      } else if (this.isPunct(cp)) {
        if (current) { tokens.push(current); current = '' }
        tokens.push(char)
      } else {
        current += char
      }
    }
    if (current) tokens.push(current)
    return tokens
  }

  isPunct(cp) {
    return (cp >= 0x21 && cp <= 0x2F) || (cp >= 0x3A && cp <= 0x40) ||
      (cp >= 0x5B && cp <= 0x60) || (cp >= 0x7B && cp <= 0x7E)
  }

  tokenizeWord(word) {
    if (word.length > 100) return [100] // [UNK]
    const tokens = []
    let start = 0
    while (start < word.length) {
      let end = word.length
      let foundId
      while (start < end) {
        const substr = start === 0 ? word.slice(start, end) : '##' + word.slice(start, end)
        const id = this.vocab.get(substr)
        if (id !== undefined) { foundId = id; break }
        end--
      }
      if (foundId === undefined) return [100] // [UNK]
      tokens.push(foundId)
      start = end
    }
    return tokens
  }
}

// ─── Mean Pooling ───────────────────────────────────────────────────────────

function meanPool(hiddenStates, attentionMask, seqLen, hiddenSize) {
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
    for (let d = 0; d < hiddenSize; d++) pooled[d] /= tokenCount
  }
  return pooled
}

function l2Normalize(vec) {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Resolve onnxruntime-node
  let ort
  try {
    ort = await import('onnxruntime-node')
  } catch {
    // Try from server/node_modules (entry is CJS dist/index.js for onnxruntime-node)
    const candidates = [
      path.join(repoRoot, 'server/node_modules/onnxruntime-node/dist/index.js'),
      path.join(repoRoot, 'server/node_modules/onnxruntime-node/dist/index.mjs'),
    ]
    const serverOrt = candidates.find((p) => fs.existsSync(p))
    if (serverOrt) {
      ort = await import(`file://${serverOrt}`)
    } else {
      console.error('onnxruntime-node not found. Install it or run from server directory.')
      process.exit(1)
    }
  }

  // Resolve model path (prefer server/models/minilm for full quality)
  const modelPath = path.join(repoRoot, 'server/models/minilm/model.onnx')
  const tokenizerPath = path.join(repoRoot, 'server/models/minilm/tokenizer.json')

  if (!fs.existsSync(modelPath)) {
    console.error(`Model not found at: ${modelPath}`)
    console.error('Run: npm run model:copy-deploy')
    process.exit(1)
  }

  // ─── Fast hash check: skip regeneration if the existing binary is current ──
  const outputDir = path.join(repoRoot, 'public/models/minilm')
  const outputPath = path.join(outputDir, 'intent-vectors.bin')
  const currentHash = intentPhrasesHash(INTENT_PHRASES)

  if (fs.existsSync(outputPath)) {
    const existing = fs.readFileSync(outputPath)
    if (existing.length >= 16) {
      const version = existing.readUInt32LE(0)
      const embeddedHash = existing.readUInt32LE(12)
      if (version === 2 && embeddedHash === currentHash) {
        console.log(`intent-vectors.bin is up to date (hash 0x${currentHash.toString(16).padStart(8, '0')}). Skipping.`)
        return
      }
      console.log(`Stale intent-vectors.bin (version ${version}, hash 0x${existing.readUInt32LE(12).toString(16).padStart(8, '0')} vs current 0x${currentHash.toString(16).padStart(8, '0')}). Regenerating.`)
    }
  }

  console.log(`Loading model: ${modelPath}`)
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
  })
  console.log(`Model loaded. Inputs: ${session.inputNames.join(', ')}`)

  // Load tokenizer vocab
  const tokenizerJson = JSON.parse(fs.readFileSync(tokenizerPath, 'utf8'))
  const vocabMap = new Map(Object.entries(tokenizerJson.model.vocab))
  const tokenizer = new WordPieceTokenizer(vocabMap)

  console.log(`Tokenizer loaded (${vocabMap.size} tokens)`)

  // Process each intent
  const intentNames = Object.keys(INTENT_PHRASES).filter(k => k !== 'unknown' && INTENT_PHRASES[k].length > 0)
  const HIDDEN_SIZE = 384
  const results = []

  for (const intentName of intentNames) {
    const phrases = INTENT_PHRASES[intentName]
    const phraseEmbeddings = []

    for (const phrase of phrases) {
      const encoded = tokenizer.encode(phrase)

      const inputIdsTensor = new ort.Tensor('int64', encoded.inputIds, [1, 128])
      const attentionMaskTensor = new ort.Tensor('int64', encoded.attentionMask, [1, 128])
      const tokenTypeIdsTensor = new ort.Tensor('int64', encoded.tokenTypeIds, [1, 128])

      const output = await session.run({
        input_ids: inputIdsTensor,
        attention_mask: attentionMaskTensor,
        token_type_ids: tokenTypeIdsTensor,
      })

      const outputData = output[session.outputNames[0]].data
      const embedding = meanPool(outputData, encoded.attentionMask, 128, HIDDEN_SIZE)
      l2Normalize(embedding)
      phraseEmbeddings.push(embedding)
    }

    // Mean-pool all phrase embeddings for this intent
    const meanEmb = new Float32Array(HIDDEN_SIZE)
    for (const emb of phraseEmbeddings) {
      for (let d = 0; d < HIDDEN_SIZE; d++) meanEmb[d] += emb[d]
    }
    for (let d = 0; d < HIDDEN_SIZE; d++) meanEmb[d] /= phraseEmbeddings.length
    l2Normalize(meanEmb)

    results.push({ name: intentName, embedding: meanEmb, numPhrases: phrases.length })
    console.log(`  ✓ ${intentName} (${phrases.length} phrases)`)
  }

  // Write binary file
  // Format (v2): version(u32) + numIntents(u32) + dim(u32) + phrasesHash(u32)
  //              + [name(32 bytes) + numPhrases(u32)] × N + [float32 × dim] × N
  //
  // phrasesHash: FNV-1a of the phrase set from shared/intentPhrases.js. The
  // client validates this against its own hash so stale vectors from a previous
  // phrase set are rejected and the runtime bootstrap kicks in instead.
  const VERSION = 2
  const PHRASES_HASH = intentPhrasesHash(INTENT_PHRASES)
  const numIntents = results.length
  const headerSize = 16 + numIntents * 36 // 16 bytes global + 36 per intent (32 name + 4 numPhrases)
  const embeddingsSize = numIntents * HIDDEN_SIZE * 4
  const totalSize = headerSize + embeddingsSize

  const buffer = Buffer.alloc(totalSize)
  let offset = 0

  // Global header
  buffer.writeUInt32LE(VERSION, offset); offset += 4
  buffer.writeUInt32LE(numIntents, offset); offset += 4
  buffer.writeUInt32LE(HIDDEN_SIZE, offset); offset += 4
  buffer.writeUInt32LE(PHRASES_HASH, offset); offset += 4

  // Per-intent headers
  for (const { name, numPhrases } of results) {
    const nameBytes = Buffer.alloc(32)
    nameBytes.write(name, 'utf8')
    nameBytes.copy(buffer, offset); offset += 32
    buffer.writeUInt32LE(numPhrases, offset); offset += 4
  }

  // Embeddings (float32 little-endian)
  for (const { embedding } of results) {
    for (let d = 0; d < HIDDEN_SIZE; d++) {
      buffer.writeFloatLE(embedding[d], offset); offset += 4
    }
  }

  // Write output
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, buffer)

  console.log(`\nWritten: ${outputPath} (${totalSize} bytes, ${numIntents} intents × ${HIDDEN_SIZE} dims)`)
  console.log(`  format v${VERSION}, phrasesHash 0x${PHRASES_HASH.toString(16).padStart(8, '0')}`)
  console.log('This file should be served alongside model.onnx for instant bootstrap.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

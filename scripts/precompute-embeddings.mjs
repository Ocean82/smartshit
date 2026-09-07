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
import { capabilityExamplesMap, capabilityPhrasesHash } from '../shared/capabilities.js'

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

function writeVectorsBin(outputPath, results, phrasesHash, label) {
  const VERSION = 2
  const HIDDEN_SIZE = 384
  const numEntries = results.length
  const headerSize = 16 + numEntries * 36
  const embeddingsSize = numEntries * HIDDEN_SIZE * 4
  const totalSize = headerSize + embeddingsSize

  const buffer = Buffer.alloc(totalSize)
  let offset = 0

  buffer.writeUInt32LE(VERSION, offset); offset += 4
  buffer.writeUInt32LE(numEntries, offset); offset += 4
  buffer.writeUInt32LE(HIDDEN_SIZE, offset); offset += 4
  buffer.writeUInt32LE(phrasesHash, offset); offset += 4

  for (const { name, numPhrases } of results) {
    const nameBytes = Buffer.alloc(32)
    nameBytes.write(name, 'utf8')
    nameBytes.copy(buffer, offset); offset += 32
    buffer.writeUInt32LE(numPhrases, offset); offset += 4
  }

  for (const { embedding } of results) {
    for (let d = 0; d < HIDDEN_SIZE; d++) {
      buffer.writeFloatLE(embedding[d], offset); offset += 4
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, buffer)
  console.log(`\nWritten: ${outputPath} (${totalSize} bytes, ${numEntries} ${label} × ${HIDDEN_SIZE} dims)`)
  console.log(`  format v${VERSION}, phrasesHash 0x${phrasesHash.toString(16).padStart(8, '0')}`)
}

function isBinUpToDate(outputPath, currentHash) {
  if (!fs.existsSync(outputPath)) return false
  const existing = fs.readFileSync(outputPath)
  if (existing.length < 16) return false
  const version = existing.readUInt32LE(0)
  const embeddedHash = existing.readUInt32LE(12)
  return version === 2 && embeddedHash === currentHash
}

async function embedPhraseSet(session, ort, tokenizer, phraseMap, skipKeys = new Set()) {
  const HIDDEN_SIZE = 384
  const names = Object.keys(phraseMap).filter((k) => !skipKeys.has(k) && (phraseMap[k]?.length ?? 0) > 0)
  const results = []

  for (const name of names) {
    const phrases = phraseMap[name]
    const phraseEmbeddings = []

    for (const phrase of phrases) {
      const encoded = tokenizer.encode(phrase)
      const output = await session.run({
        input_ids: new ort.Tensor('int64', encoded.inputIds, [1, 128]),
        attention_mask: new ort.Tensor('int64', encoded.attentionMask, [1, 128]),
        token_type_ids: new ort.Tensor('int64', encoded.tokenTypeIds, [1, 128]),
      })
      const outputData = output[session.outputNames[0]].data
      const embedding = meanPool(outputData, encoded.attentionMask, 128, HIDDEN_SIZE)
      l2Normalize(embedding)
      phraseEmbeddings.push(embedding)
    }

    const meanEmb = new Float32Array(HIDDEN_SIZE)
    for (const emb of phraseEmbeddings) {
      for (let d = 0; d < HIDDEN_SIZE; d++) meanEmb[d] += emb[d]
    }
    for (let d = 0; d < HIDDEN_SIZE; d++) meanEmb[d] /= phraseEmbeddings.length
    l2Normalize(meanEmb)

    results.push({ name, embedding: meanEmb, numPhrases: phrases.length })
    console.log(`  ✓ ${name} (${phrases.length} phrases)`)
  }

  return results
}

async function main() {
  // Resolve onnxruntime-node
  let ort
  try {
    ort = await import('onnxruntime-node')
  } catch {
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

  const modelPath = path.join(repoRoot, 'server/models/minilm/model.onnx')
  const tokenizerPath = path.join(repoRoot, 'server/models/minilm/tokenizer.json')

  if (!fs.existsSync(modelPath)) {
    console.error(`Model not found at: ${modelPath}`)
    console.error('Run: npm run model:copy-deploy')
    process.exit(1)
  }

  const outputDir = path.join(repoRoot, 'public/models/minilm')
  const intentPath = path.join(outputDir, 'intent-vectors.bin')
  const capabilityPath = path.join(outputDir, 'capability-vectors.bin')
  const intentHash = intentPhrasesHash(INTENT_PHRASES)
  const capabilityHash = capabilityPhrasesHash()
  const intentFresh = isBinUpToDate(intentPath, intentHash)
  const capabilityFresh = isBinUpToDate(capabilityPath, capabilityHash)

  if (intentFresh && capabilityFresh) {
    console.log('intent-vectors.bin and capability-vectors.bin are up to date. Skipping.')
    return
  }

  console.log(`Loading model: ${modelPath}`)
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
  })
  console.log(`Model loaded. Inputs: ${session.inputNames.join(', ')}`)

  const tokenizerJson = JSON.parse(fs.readFileSync(tokenizerPath, 'utf8'))
  const vocabMap = new Map(Object.entries(tokenizerJson.model.vocab))
  const tokenizer = new WordPieceTokenizer(vocabMap)
  console.log(`Tokenizer loaded (${vocabMap.size} tokens)`)

  if (!intentFresh) {
    console.log('Computing intent embeddings…')
    const intentResults = await embedPhraseSet(session, ort, tokenizer, INTENT_PHRASES, new Set(['unknown']))
    writeVectorsBin(intentPath, intentResults, intentHash, 'intents')
  } else {
    console.log('intent-vectors.bin is up to date. Skipping intents.')
  }

  if (!capabilityFresh) {
    console.log('Computing capability embeddings…')
    const capabilityResults = await embedPhraseSet(session, ort, tokenizer, capabilityExamplesMap())
    writeVectorsBin(capabilityPath, capabilityResults, capabilityHash, 'capabilities')
  } else {
    console.log('capability-vectors.bin is up to date. Skipping capabilities.')
  }

  console.log('This file should be served alongside model.onnx for instant bootstrap.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

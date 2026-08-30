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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// ─── Intent Phrases (duplicated from src/ai/nlp/intentEmbeddings.ts) ────────

const INTENT_PHRASES = {
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
}

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
  // Format: version(u32) + numIntents(u32) + dim(u32) + [name(32 bytes) + numPhrases(u32)] × N + [float32 × dim] × N
  const VERSION = 1
  const numIntents = results.length
  const headerSize = 12 + numIntents * 36 // 12 bytes global + 36 per intent (32 name + 4 numPhrases)
  const embeddingsSize = numIntents * HIDDEN_SIZE * 4
  const totalSize = headerSize + embeddingsSize

  const buffer = Buffer.alloc(totalSize)
  let offset = 0

  // Global header
  buffer.writeUInt32LE(VERSION, offset); offset += 4
  buffer.writeUInt32LE(numIntents, offset); offset += 4
  buffer.writeUInt32LE(HIDDEN_SIZE, offset); offset += 4

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
  const outputDir = path.join(repoRoot, 'public/models/minilm')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'intent-vectors.bin')
  fs.writeFileSync(outputPath, buffer)

  console.log(`\nWritten: ${outputPath} (${totalSize} bytes, ${numIntents} intents × ${HIDDEN_SIZE} dims)`)
  console.log('This file should be served alongside model.onnx for instant bootstrap.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

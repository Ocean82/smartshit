#!/usr/bin/env node
/**
 * Copy (or download) deploy models for ONNX Path B + optional local Ollama GGUF.
 *
 * Primary: MiniLM (all-MiniLM-L6-v2) → server/models/minilm/
 * Optional: --public also copies tokenizer + model into public/models/minilm/ (Path A)
 * Optional: --with-spreadsheet-rl copies GGUF into models/ for local Ollama
 *           (skipped by default — production already has Spreadsheet-RL-4B)
 *
 * Usage:
 *   node scripts/copy-deploy-models.mjs                       # server copy only (full model)
 *   node scripts/copy-deploy-models.mjs --public              # server + client copies
 *   node scripts/copy-deploy-models.mjs --public-only         # client copy only (quantized)
 *   SMARTSHT_MINILM_SRC=/path/to/dir node scripts/copy-deploy-models.mjs
 *
 * Idempotent: an existing model.onnx + tokenizers are kept, so repeat runs
 * don't re-download (~86 MB full / ~22 MB quantized). Delete the file to
 * force a refresh.
 *
 * Network: Hugging Face download fallback requires outbound HTTPS.
 * Runtime: Node.js 18+ (uses global fetch).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const TOKENIZER_FILES = [
  'tokenizer.json',
  'vocab.txt',
  'config.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
]

const HF_BASE =
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main'
const HF_ONNX_URL = `${HF_BASE}/onnx/model.onnx`
const HF_ONNX_QUANTIZED_URL = `${HF_BASE}/onnx/model_quantized.onnx`

const args = new Set(process.argv.slice(2))
const withPublic = args.has('--public') || args.has('--public-only')
const publicOnly = args.has('--public-only')
const withSpreadsheetRl = args.has('--with-spreadsheet-rl')

function exists(p) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

/** Shallow walk (maxDepth) looking for a file named model.onnx */
function findModelOnnx(root, maxDepth = 4) {
  if (!exists(root)) return null
  const queue = [{ dir: root, depth: 0 }]
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isFile() && ent.name === 'model.onnx') return full
      if (ent.isDirectory() && depth < maxDepth && !ent.name.startsWith('.')) {
        queue.push({ dir: full, depth: depth + 1 })
      }
    }
  }
  return null
}

function resolveLocalMiniLmSource() {
  const candidates = [
    path.join(repoRoot, 'temp/all-MiniLM-L6-v2/onnx/model.onnx'),
    path.join(repoRoot, 'temp/models/all-MiniLM-L6-v2/onnx/model.onnx'),
    path.join(repoRoot, 'temp/onnx/model.onnx'),
  ]

  const envSrc = process.env.SMARTSHT_MINILM_SRC?.trim()
  if (envSrc) {
    if (envSrc.endsWith('.onnx')) candidates.unshift(envSrc)
    else candidates.unshift(path.join(envSrc, 'model.onnx'), path.join(envSrc, 'onnx', 'model.onnx'))
  }

  for (const c of candidates) {
    if (exists(c)) return c
  }

  // Windows local workbook cache (no-op on Linux if path missing)
  const winRoot = 'D:/spreadsht_workbook'
  if (exists(winRoot)) {
    const found = findModelOnnx(winRoot, 5)
    if (found) return found
  }

  return null
}

/**
 * Resolve the quantized MiniLM model for client-side (Path A).
 * Quantized variant is ~22MB vs 86MB full — much better for browser delivery.
 */
function resolveLocalQuantizedSource() {
  const candidates = [
    path.join(repoRoot, 'temp/models/all-MiniLM-L6-v2/onnx/model_quantized.onnx'),
    path.join(repoRoot, 'temp/all-MiniLM-L6-v2/onnx/model_quantized.onnx'),
    path.join(repoRoot, 'temp/onnx/model_quantized.onnx'),
  ]

  const envSrc = process.env.SMARTSHT_MINILM_SRC?.trim()
  if (envSrc) {
    if (envSrc.endsWith('.onnx')) candidates.unshift(envSrc.replace('.onnx', '_quantized.onnx'))
    else candidates.unshift(path.join(envSrc, 'model_quantized.onnx'), path.join(envSrc, 'onnx', 'model_quantized.onnx'))
  }

  for (const c of candidates) {
    if (exists(c)) return c
  }
  return null
}

function companionSearchRoots(modelOnnxPath) {
  const onnxDir = path.dirname(modelOnnxPath)
  const modelRoot = path.dirname(onnxDir) // .../all-MiniLM-L6-v2 when under .../onnx/
  return [onnxDir, modelRoot, path.dirname(modelRoot)]
}

function findCompanion(modelOnnxPath, fileName) {
  for (const root of companionSearchRoots(modelOnnxPath)) {
    const p = path.join(root, fileName)
    if (exists(p)) return p
  }
  return null
}

async function downloadFile(url, dest) {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'scripts/copy-deploy-models.mjs requires Node.js 18+ with global fetch (or a fetch polyfill)',
    )
  }

  console.log(`  downloading ${url}`)
  const res = await globalThis.fetch(url)
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} ${res.statusText}: ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  console.log(`  wrote ${dest} (${buf.length} bytes)`)
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  const size = fs.statSync(dest).size
  console.log(`  copied ${src} → ${dest} (${size} bytes)`)
}

async function ensureMiniLm(destDir, { quantized = false } = {}) {
  fs.mkdirSync(destDir, { recursive: true })
  const destModel = path.join(destDir, 'model.onnx')

  // Idempotent: keep existing model + tokenizers, avoiding a ~86MB/~22MB
  // re-download on every deploy. Delete model.onnx to force a refresh.
  const hasModel = exists(destModel)
  const hasTokenizers = TOKENIZER_FILES.every((name) => exists(path.join(destDir, name)))
  if (hasModel && hasTokenizers) {
    console.log(`Model already present, skipping: ${destDir}`)
    return { source: 'existing', modelPath: destModel }
  }

  // For client-side (--public/-only), prefer the quantized model (~22MB vs 86MB)
  if (quantized) {
    const quantizedSrc = resolveLocalQuantizedSource()
    if (quantizedSrc) {
      console.log(`MiniLM source (local quantized): ${quantizedSrc}`)
      copyFile(quantizedSrc, destModel)
      // Tokenizer files come from the same directory tree
      for (const name of TOKENIZER_FILES) {
        const src = findCompanion(quantizedSrc, name)
        if (src) copyFile(src, path.join(destDir, name))
      }
      return { source: 'local-quantized', modelPath: destModel }
    }

    // Fall back to download quantized from HuggingFace
    console.log('MiniLM source: Hugging Face download (quantized, requires network)')
    console.log(`  repo: Xenova/all-MiniLM-L6-v2`)
    await downloadFile(HF_ONNX_QUANTIZED_URL, destModel)
    for (const name of TOKENIZER_FILES) {
      const url = `${HF_BASE}/${name}`
      try {
        await downloadFile(url, path.join(destDir, name))
      } catch (err) {
        console.warn(`  skip ${name}: ${err instanceof Error ? err.message : err}`)
      }
    }
    return { source: 'download-quantized', modelPath: destModel }
  }

  // Server-side: use the full model for maximum quality
  const localSrc = resolveLocalMiniLmSource()
  if (localSrc) {
    console.log(`MiniLM source (local): ${localSrc}`)
    copyFile(localSrc, destModel)
    for (const name of TOKENIZER_FILES) {
      const src = findCompanion(localSrc, name)
      if (src) copyFile(src, path.join(destDir, name))
    }
    return { source: 'local', modelPath: destModel }
  }

  console.log('MiniLM source: Hugging Face download (requires network)')
  console.log(`  repo: Xenova/all-MiniLM-L6-v2`)
  await downloadFile(HF_ONNX_URL, destModel)
  for (const name of TOKENIZER_FILES) {
    const url = `${HF_BASE}/${name}`
    try {
      await downloadFile(url, path.join(destDir, name))
    } catch (err) {
      console.warn(`  skip ${name}: ${err instanceof Error ? err.message : err}`)
    }
  }
  return { source: 'download', modelPath: destModel }
}

function copySpreadsheetRlOptional() {
  console.log('')
  if (!withSpreadsheetRl) {
    console.log(
      'Note: Production already has Spreadsheet-RL-4B — verify Modelfile only.',
    )
    console.log(
      '      (Local optional: pass --with-spreadsheet-rl to copy a GGUF into models/)',
    )
    return
  }

  const destDir = path.join(repoRoot, 'models')
  fs.mkdirSync(destDir, { recursive: true })

  const ggufCandidates = [
    process.env.SMARTSHT_GGUF_SRC,
    path.join(repoRoot, 'temp/Spreadsheet-RL-4B.Q4_K_M.gguf'),
    path.join(repoRoot, 'temp/models/Spreadsheet-RL-4B.Q4_K_M.gguf'),
    'D:/spreadsht_workbook/Spreadsheet-RL-4B.Q4_K_M.gguf',
  ].filter(Boolean)

  const src = ggufCandidates.find((p) => exists(p))
  if (!src) {
    console.warn('  --with-spreadsheet-rl: no GGUF found; skip copy')
    return
  }
  copyFile(src, path.join(destDir, path.basename(src)))
  console.log('  Register with: ollama create smartshit -f server/Modelfile.spreadsheet-rl')
}

async function main() {
  if (publicOnly) {
    console.log('copy-deploy-models: public only (server copy skipped)')
  } else {
    console.log('copy-deploy-models: MiniLM → server/models/minilm/')
    const serverDest = path.join(repoRoot, 'server/models/minilm')
    await ensureMiniLm(serverDest)
  }

  if (withPublic) {
    console.log('Also ensuring public/models/minilm/ (Path A, quantized ~22MB)')
    const publicDest = path.join(repoRoot, 'public/models/minilm')
    await ensureMiniLm(publicDest, { quantized: true })
  }

  copySpreadsheetRlOptional()

  console.log('')
  console.log('Done. Runtime path: server/models/minilm/model.onnx')
  console.log('Do not link the server to temp/ or D:\\spreadsht_workbook — copy only.')
  console.log('Repeat runs skip existing models (idempotent).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

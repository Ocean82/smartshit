import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const modelName = process.env.SMARTSHIT_MODEL ?? 'smartshit'

/**
 * Per-platform Modelfile + GGUF pairs to try, in priority order.
 *
 * GGUF locations are resolved at runtime. Committed Modelfiles use a relative
 * `FROM ../models/...` path; this script rewrites FROM to the verified absolute
 * file before calling `ollama create`, so Windows, Linux contributors, and the
 * existing production path (/home/ubuntu/...) all work without machine-specific
 * files in git.
 */
const candidates = [
  {
    label: 'Spreadsheet-RL-4B (production)',
    ggufNames: ['Spreadsheet-RL-4B.Q4_K_M.gguf'],
    extraGgufDirs: ['/home/ubuntu'],
    modelfile: path.join(projectRoot, 'server', 'Modelfile.local'),
    modelfileFallback: path.join(projectRoot, 'server', 'Modelfile.spreadsheet-rl'),
  },
  {
    label: 'Qwen2.5-Coder-1.5B (dev)',
    ggufNames: ['qwen2.5-coder-1.5b-q8_0.gguf'],
    extraGgufDirs: [],
    modelfile: path.join(projectRoot, 'server', 'Modelfile'),
    modelfileFallback: null,
  },
]

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

function fileExists(p) {
  try {
    return Boolean(p) && fs.existsSync(p)
  } catch {
    return false
  }
}

/**
 * Resolve a GGUF path for a candidate.
 * Order: SMARTSHT_GGUF_SRC (explicit override), repo models/, extra host dirs.
 */
function resolveGguf(candidate) {
  const override = process.env.SMARTSHT_GGUF_SRC
  if (override) {
    const abs = path.resolve(override)
    if (fileExists(abs)) return abs
    console.error(`SMARTSHT_GGUF_SRC is set but not found: ${abs}`)
    process.exit(1)
  }

  const searchDirs = [path.join(projectRoot, 'models'), ...candidate.extraGgufDirs]
  for (const dir of searchDirs) {
    for (const name of candidate.ggufNames) {
      const candidatePath = path.join(dir, name)
      if (fileExists(candidatePath)) return candidatePath
    }
  }
  return null
}

function expectedGgufPaths(candidate) {
  const paths = []
  if (process.env.SMARTSHT_GGUF_SRC) paths.push(path.resolve(process.env.SMARTSHT_GGUF_SRC))
  for (const dir of [path.join(projectRoot, 'models'), ...candidate.extraGgufDirs]) {
    for (const name of candidate.ggufNames) paths.push(path.join(dir, name))
  }
  return paths
}

function pickModelfile(candidate) {
  if (fileExists(candidate.modelfile)) return candidate.modelfile
  if (candidate.modelfileFallback && fileExists(candidate.modelfileFallback)) {
    return candidate.modelfileFallback
  }
  return null
}

/**
 * Ollama resolves FROM relative to the Modelfile. Emit a temp copy with an
 * absolute FROM so the verified GGUF is used regardless of cwd or host layout.
 */
function materializeModelfile(srcModelfile, ggufAbsPath) {
  const text = fs.readFileSync(srcModelfile, 'utf8')
  if (!/^FROM\s+\S+/m.test(text)) {
    console.error(`Modelfile has no FROM line: ${srcModelfile}`)
    process.exit(1)
  }
  // Ollama on Windows accepts forward slashes in FROM.
  const fromPath = ggufAbsPath.replace(/\\/g, '/')
  const resolved = text.replace(/^FROM\s+\S+/m, `FROM ${fromPath}`)
  const tmp = path.join(os.tmpdir(), `smartsht-Modelfile-${process.pid}`)
  fs.writeFileSync(tmp, resolved, 'utf8')
  return tmp
}

async function main() {
  let chosen = null
  for (const candidate of candidates) {
    const gguf = resolveGguf(candidate)
    if (!gguf) continue
    chosen = { candidate, gguf }
    break
  }

  if (!chosen) {
    console.error('No GGUF model files found. Download one from Hugging Face into models/.')
    console.error('Expected at least one of:')
    for (const c of candidates) {
      for (const p of expectedGgufPaths(c)) console.error(' -', p)
    }
    console.error('Or set SMARTSHT_GGUF_SRC to an existing .gguf file.')
    process.exit(1)
  }

  const modelfilePath = pickModelfile(chosen.candidate)
  if (!modelfilePath) {
    console.error('Modelfile missing for', chosen.candidate.label)
    console.error('Checked:', chosen.candidate.modelfile, chosen.candidate.modelfileFallback)
    process.exit(1)
  }

  const resolvedModelfile = materializeModelfile(modelfilePath, chosen.gguf)

  console.log(`Registering Ollama model: ${modelName}`)
  console.log(`  Source: ${chosen.candidate.label}`)
  console.log(`  GGUF:   ${chosen.gguf}`)
  console.log(`  Modelfile: ${modelfilePath}`)

  try {
    await run('ollama', ['create', modelName, '-f', resolvedModelfile], projectRoot)
  } finally {
    fs.rmSync(resolvedModelfile, { force: true })
  }

  console.log('')
  console.log('✓ Model ready:', modelName)
  console.log('  Test with: ollama run', modelName)
  console.log('  Then start: npm run dev:server')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

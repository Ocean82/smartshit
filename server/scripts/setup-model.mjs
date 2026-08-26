import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const modelName = process.env.SMARTSHIT_MODEL ?? 'smartshit'

/** Per-platform Modelfile + GGUF pairs to try, in priority order. */
const candidates = [
  {
    label: 'Spreadsheet-RL-4B (production)',
    gguf: path.join(projectRoot, 'models', 'Spreadsheet-RL-4B.Q4_K_M.gguf'),
    modelfile: path.join(projectRoot, 'server', 'Modelfile.local'),   // Windows
    modelfileFallback: path.join(projectRoot, 'server', 'Modelfile.spreadsheet-rl'), // Linux
  },
  {
    label: 'Qwen2.5-Coder-1.5B (dev)',
    gguf: path.join(projectRoot, 'models', 'qwen2.5-coder-1.5b-q8_0.gguf'),
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

async function main() {
  const candidate = candidates.find((c) => fs.existsSync(c.gguf))
  if (!candidate) {
    console.error('No GGUF model files found in models/. Download one from Hugging Face.')
    console.error('Expected at least one of:')
    for (const c of candidates) console.error(' -', c.gguf)
    process.exit(1)
  }

  const modelfilePath = fs.existsSync(candidate.modelfile)
    ? candidate.modelfile
    : candidate.modelfileFallback
  if (!modelfilePath || !fs.existsSync(modelfilePath)) {
    console.error('Modelfile missing for', candidate.label)
    console.error('Checked:', candidate.modelfile, candidate.modelfileFallback)
    process.exit(1)
  }

  console.log(`Registering Ollama model: ${modelName}`)
  console.log(`  Source: ${candidate.label}`)
  console.log(`  GGUF:   ${candidate.gguf}`)
  console.log(`  Modelfile: ${modelfilePath}`)

  await run('ollama', ['create', modelName, '-f', modelfilePath], projectRoot)
  console.log('')
  console.log('✓ Model ready:', modelName)
  console.log('  Test with: ollama run', modelName)
  console.log('  Then start: npm run dev:server')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

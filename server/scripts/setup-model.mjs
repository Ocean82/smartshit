import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const modelPath = path.join(projectRoot, 'models', 'qwen2.5-coder-1.5b-q8_0.gguf')
const modelfilePath = path.join(projectRoot, 'server', 'Modelfile')
const modelName = process.env.SMARTSHIT_MODEL ?? 'smartshit'

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
  if (!fs.existsSync(modelPath)) {
    console.error('Model file missing:', modelPath)
    console.error('Expected: models/qwen2.5-coder-1.5b-q8_0.gguf')
    console.error('Download from Hugging Face or copy from D:\\MY-MODELS\\under 2\\')
    process.exit(1)
  }

  if (!fs.existsSync(modelfilePath)) {
    console.error('Modelfile missing:', modelfilePath)
    process.exit(1)
  }

  console.log('Registering Ollama model:', modelName)
  console.log('GGUF:', modelPath)
  console.log('Model: Qwen2.5-Coder-1.5B (Q8_0) — optimized for fast CPU inference')

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

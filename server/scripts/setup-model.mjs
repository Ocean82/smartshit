import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const modelPath = path.join(projectRoot, 'models', 'Qwen3.5-4B.q8q4.gguf')
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
    console.error('Run from project root: npm run model:copy')
    process.exit(1)
  }

  if (!fs.existsSync(modelfilePath)) {
    console.error('Modelfile missing:', modelfilePath)
    process.exit(1)
  }

  console.log('Registering Ollama model', modelName)
  console.log('GGUF:', modelPath)

  await run('ollama', ['create', modelName, '-f', modelfilePath], projectRoot)
  console.log('Model ready:', modelName)
  console.log('Test: ollama run', modelName)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

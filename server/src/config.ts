import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  modelName: process.env.SMARTSHIT_MODEL ?? 'smartshit',
  modelPath: path.join(projectRoot, 'models', 'Qwen3.5-4B.q8q4.gguf'),
  modelfilePath: path.join(projectRoot, 'server', 'Modelfile'),
  numCtx: Number(process.env.NUM_CTX ?? 4096),
  numPredict: Number(process.env.NUM_PREDICT ?? 256),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
}

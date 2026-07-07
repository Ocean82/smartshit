import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',

  // Groq (primary — fast cloud inference)
  groqApiKey: process.env.GROQ_API_KEY ?? '',
  groqModel: process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant',

  // Ollama (fallback — local CPU inference)
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  modelName: process.env.SMARTSHIT_MODEL ?? 'smartshit',
  modelPath: path.join(projectRoot, 'models', 'qwen2.5-coder-1.5b-q8_0.gguf'),
  modelfilePath: path.join(projectRoot, 'server', 'Modelfile'),

  /** Context window — smaller = faster on CPU */
  numCtx: Number(process.env.NUM_CTX ?? 2048),
  /** Max tokens to generate per response */
  numPredict: Number(process.env.NUM_PREDICT ?? 512),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
}

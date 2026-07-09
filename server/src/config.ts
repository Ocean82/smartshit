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

  // OpenRouter (optional primary)
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openRouterModel: process.env.OPENROUTER_MODEL ?? 'qwen/qwen3-32b',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',

  // Hugging Face Inference Router (optional primary)
  huggingFaceApiKey: process.env.HUGGINGFACE_API_KEY ?? '',
  huggingFaceModel: process.env.HUGGINGFACE_MODEL ?? 'Qwen/Qwen3-32B',
  huggingFaceBaseUrl: process.env.HUGGINGFACE_BASE_URL ?? 'https://router.huggingface.co/v1',

  // Provider failover priority
  llmProviderOrder: (process.env.LLM_PROVIDER_ORDER ?? 'openrouter,huggingface,groq,ollama')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean),

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

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripePriceId: process.env.STRIPE_PRICE_ID ?? 'price_1TqYGCP38C54URjEZIBJEXDU',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',

  // App URL for redirects
  appUrl: process.env.APP_URL ?? 'https://smartsht.com',

  analysis: {
    maxRowsPreview: 25,
    maxRowsAnalysis: 10_000,
    outlierStdThreshold: 2.5,
  },

  intentConfidenceThreshold: Number(process.env.INTENT_CONFIDENCE_THRESHOLD ?? 0.6),
}

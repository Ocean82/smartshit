import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './loadEnv.js'

loadEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

// ─── Validation constants ────────────────────────────────────────────────────

/** Known Groq-supported model identifiers. Update when Groq adds new models. */
const KNOWN_GROQ_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.3-70b-specdec',
  'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile',
  'llama-3.2-1b-preview',
  'llama-3.2-3b-preview',
  'llama-3.2-11b-vision-preview',
  'llama-3.2-90b-vision-preview',
  'gemma2-9b-it',
  'mixtral-8x7b-32768',
  'qwen-qwq-32b',
  'deepseek-r1-distill-llama-70b',
])

/** Canonical list of supported LLM provider identifiers. */
const ALLOWED_PROVIDERS = ['openrouter', 'huggingface', 'groq', 'ollama'] as const
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number]

// ─── Parse and validate provider order ───────────────────────────────────────

const rawProviderOrder = (process.env.LLM_PROVIDER_ORDER ?? 'groq,ollama')
  .split(',')
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean)

const allowedSet = new Set<string>(ALLOWED_PROVIDERS)
const invalidProviders = rawProviderOrder.filter((p) => !allowedSet.has(p))
if (invalidProviders.length > 0) {
  console.warn(
    `[config] LLM_PROVIDER_ORDER contains unknown providers: ${invalidProviders.join(', ')}. ` +
    `Allowed: ${ALLOWED_PROVIDERS.join(', ')}. Unknown entries will be ignored.`,
  )
}
const validatedProviderOrder = rawProviderOrder.filter((p): p is AllowedProvider => allowedSet.has(p))

// ─── Validate Groq model ────────────────────────────────────────────────────

const groqModel = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
if (groqModel && !KNOWN_GROQ_MODELS.has(groqModel)) {
  console.warn(
    `[config] GROQ_MODEL="${groqModel}" is not in the known models list. ` +
    `This may be a typo or a newly released model. Known models: ${[...KNOWN_GROQ_MODELS].join(', ')}`,
  )
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',

  // Groq (primary — fast cloud inference)
  groqApiKey: process.env.GROQ_API_KEY ?? '',
  groqModel,

  // OpenRouter (optional primary)
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openRouterModel: process.env.OPENROUTER_MODEL ?? 'qwen/qwen3-32b',
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',

  // Hugging Face Inference Router (optional primary)
  huggingFaceApiKey: process.env.HUGGINGFACE_API_KEY ?? '',
  huggingFaceModel: process.env.HUGGINGFACE_MODEL ?? 'Qwen/Qwen3-32B',
  huggingFaceBaseUrl: process.env.HUGGINGFACE_BASE_URL ?? 'https://router.huggingface.co/v1',

  // Provider failover priority (validated above)
  llmProviderOrder: validatedProviderOrder,

  // Ollama (fallback — local CPU inference)
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  modelName: process.env.SMARTSHIT_MODEL ?? 'smartshit',
  /** Excel-assist finetuned model (structured JSON output, better tool routing) */
  assistModelName: process.env.SMARTSHT_ASSIST_MODEL ?? 'smartsht-assist',
  modelPath: path.join(projectRoot, 'models', 'qwen2.5-coder-1.5b-q8_0.gguf'),
  modelfilePath: path.join(projectRoot, 'server', 'Modelfile'),

  /** Context window — smaller = faster on CPU */
  numCtx: Number(process.env.NUM_CTX ?? 2048),
  /** Max tokens to generate per response */
  numPredict: Number(process.env.NUM_PREDICT ?? 512),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // Cloud Storage (RDS + S3)
  databaseUrl: process.env.DATABASE_URL ?? '',
  s3Bucket: process.env.S3_BUCKET ?? 'burntbeatz2-storage',
  s3Region: process.env.S3_REGION ?? 'us-east-1',
  s3Prefix: process.env.S3_SMARTSHT_PREFIX ?? 'smartsht',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',

  // Clerk (SmartSht — https://clerk.smartsht.com)
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  clerkPublishableKey:
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? '',

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripePriceId: process.env.STRIPE_PRICE_ID ?? 'price_1TqYGCP38C54URjEZIBJEXDU',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',

  // App URL for redirects
  appUrl: process.env.APP_URL ?? 'https://smartsht.com',

  analysis: {
    maxRowsPreview: 60,
    maxRowsAnalysis: 10_000,
    outlierStdThreshold: 2.5,
  },

  intentConfidenceThreshold: Math.max(0, Math.min(1, Number(process.env.INTENT_CONFIDENCE_THRESHOLD ?? 0.6))),
}

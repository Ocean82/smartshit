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

const rawProviderOrder = (process.env.LLM_PROVIDER_ORDER ?? 'groq,openrouter,ollama')
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

// ─── Trust proxy ─────────────────────────────────────────────────────────────

/**
 * Express `trust proxy` setting.
 *
 * In production the API sits behind nginx on 127.0.0.1, which forwards
 * `X-Forwarded-For`. Without this, every request reports `req.ip` as
 * "127.0.0.1", collapsing all IP-based rate limiting into a single shared
 * bucket for the entire internet.
 *
 * Defaults to "loopback": trust the header only when the connection itself
 * originates from localhost. That is exactly the nginx topology, and it stays
 * safe if the server is ever exposed directly, since a remote client cannot
 * then spoof its address via X-Forwarded-For.
 *
 * Override with TRUST_PROXY: a number of hops, `true`/`false`, or a
 * comma-separated list of trusted addresses/subnets.
 */
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw.trim() === '') return 'loopback'
  const value = raw.trim()
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  const asNumber = Number(value)
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber
  return value
}

// ─── CORS ────────────────────────────────────────────────────────────────────

/**
 * Resolve the allowed CORS origin(s).
 *
 * Defaults to the configured app URL plus local dev origins rather than "*".
 * A wildcard lets any site drive the API with a token it has obtained, and
 * makes the LLM-backed endpoints trivially embeddable in third-party pages.
 * Set `CORS_ORIGIN=*` explicitly to opt back into the permissive behaviour, or
 * pass a comma-separated allowlist.
 */
function resolveCorsOrigin(): string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim()
  if (raw === '*') return '*'
  if (raw) {
    const origins = raw.split(',').map((o) => o.trim()).filter(Boolean)
    if (origins.length > 0) return origins
  }

  const appUrl = process.env.APP_URL ?? 'https://smartsht.com'
  const defaults = [appUrl, 'http://localhost:5173', 'http://127.0.0.1:5173']
  try {
    // Allow the www. variant of the configured app URL
    const url = new URL(appUrl)
    if (!url.hostname.startsWith('www.')) {
      defaults.push(`${url.protocol}//www.${url.hostname}`)
    }
  } catch {
    // APP_URL isn't a valid URL — fall back to the literal value only
  }
  return [...new Set(defaults)]
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? '127.0.0.1',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

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

  /** Context window — 4096 allows room for system prompt + history + context */
  numCtx: Number(process.env.NUM_CTX ?? 4096),
  /** Max tokens to generate per response */
  numPredict: Number(process.env.NUM_PREDICT ?? 768),
  corsOrigin: resolveCorsOrigin(),
  /** Max request body for workbook save/update routes (full sheet JSON). */
  workbookBodyLimit: process.env.WORKBOOK_BODY_LIMIT ?? '25mb',

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
    maxRowsPreview: 120,
    maxRowsAnalysis: 10_000,
    outlierStdThreshold: 2.5,
  },

  /** Max conversation history sent to cloud providers (Groq, OpenRouter, HuggingFace) */
  maxHistoryCloud: Number(process.env.MAX_HISTORY_CLOUD ?? 12),
  /** Max conversation history sent to local Ollama */
  maxHistoryLocal: Number(process.env.MAX_HISTORY_LOCAL ?? 4),

  intentConfidenceThreshold: Math.max(0, Math.min(1, Number(process.env.INTENT_CONFIDENCE_THRESHOLD ?? 0.6))),
}

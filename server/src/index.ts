import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import { clerkMiddleware } from '@clerk/express'
import { config, validateConfig } from './config.js'
import { createOnnxRouter } from './api/onnx-infer.js'
import { SessionPool } from './onnx/sessionPool.js'
import { getOnnxModelSize, resolveOnnxModelPath } from './onnx/modelPaths.js'
import { modelIsRegistered, ollamaReachable } from './ollama.js'
import { groqAvailable } from './groq.js'
import {
  buildActionPrompt,
  buildExplainPrompt,
  type ChatRequestBody,
  type ChatResponseBody,
} from './prompt.js'
import { FEW_SHOT_EXAMPLES } from './prompts/index.js'
import { parseAgentResponse } from './parseResponse.js'
import { resolveIntent, isWeakResponse } from './intent.js'
import { classifyMode, isLlmOnlyMode } from './mode.js'
import { parseUserIntent as parseIntentWithKeyword } from './intentParser.js'
import type { UserIntent } from '../../shared/intentTypes.js'
import { getContextualServerSuggestions } from './suggestions.js'
import {
  type ProviderName,
  providerOrder,
  providerIsConfigured,
  callProvider,
  callProviderStream,
  getModelName,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
} from './providers.js'
import { allocateBudget, estimateTokens, type ProviderName as BudgetProvider } from './tokenBudget.js'

import { checkUsage, recordUsage, getUsageStats } from './usage.js'
import { decideAiAccess, shouldRecordServerUsage } from './aiAccess.js'
import { dbHealthCheck, closePool } from './db.js'
import { s3HealthCheck } from './s3.js'
import { workbooksRouter } from './routes/workbooks.js'
import { versionsRouter } from './routes/versions.js'
import { sharesRouter } from './routes/shares.js'
import { templatesRouter } from './routes/templates.js'
import { aiFunctionRouter } from './routes/aiFunction.js'
import { requireAuth, getRequestUserId, getClerkClient, getClerkMiddlewareOptions } from './auth/clerk.js'
import { resolveIsPro, invalidateProCache } from './plan.js'
import { validateBody } from './middleware/validate.js'
import { chatStreamBodySchema, chatBodySchema } from './schemas/index.js'
import { chatRateLimiter, checkoutRateLimiter, globalRateLimiter, sharedAccessRateLimiter } from './middleware/rateLimit.js'

// ─── Validate critical configuration at startup ──────────────────────────────
validateConfig()

const app = express()

// Behind nginx (or any reverse proxy) req.ip is the proxy's address unless we
// trust the X-Forwarded-For header. Without this every IP-derived rate-limit
// key collapses to a single bucket shared by all clients.
app.set('trust proxy', config.trustProxy)

app.use(cors({ origin: config.corsOrigin }))

// ─── Security headers ────────────────────────────────────────────────────────
// Nginx adds HSTS and CSP for the frontend; these protect the API directly in
// case it's ever accessed without the reverse proxy (dev, staging, misconfigured).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// Stripe webhook needs raw body — register BEFORE express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const { verifyWebhookSignature, handleStripeWebhook } = await import('./stripe.js')
    const signatureHeader = req.headers['stripe-signature'] as string | undefined

    const event = verifyWebhookSignature(req.body, signatureHeader)
    const result = handleStripeWebhook(event)

    if (result) {
      const client = getClerkClient()
      await client.users.updateUserMetadata(result.userId, {
        publicMetadata: {
          plan: result.plan,
          stripeSubscriptionId: result.stripeSubscriptionId ?? null,
        },
      })
      // Invalidate pro cache so the user sees the change immediately
      invalidateProCache(result.userId)
      console.log(`Stripe webhook: user ${result.userId} -> plan ${result.plan}`)
    }

    res.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    console.error('Stripe webhook error:', message)
    res.status(400).json({ error: message })
  }
})

app.use(clerkMiddleware(getClerkMiddlewareOptions()))
// Workbook payloads carry the whole sheet as JSON and routinely exceed the
// default 1mb budget (imports allow 5,000 rows x 200 cols), so those routes get
// a larger cap. Everything else stays tight.
app.use('/api/workbooks', express.json({ limit: config.workbookBodyLimit }))
app.use(express.json({ limit: '1mb' }))

// Global rate limiter — generous backstop (skips /health)
app.use(globalRateLimiter)

// ─── Cloud workbook routes (Clerk JWT required) ──────────────────────────────
app.use('/api/workbooks', requireAuth, workbooksRouter)
app.use('/api/workbooks', requireAuth, versionsRouter)
app.use('/api/workbooks', requireAuth, sharesRouter)
app.use('/api', sharedAccessRateLimiter, sharesRouter)  // Public GET /api/shared/:token; mutating routes check auth in-handler
app.use('/api/community-templates', templatesRouter)

// ─── AI Function endpoint (formula-level AI calls) ───────────────────────────
app.use('/api/ai-function', aiFunctionRouter)

// ─── ONNX Path B (server-side inference via onnxruntime-node) ────────────────
// Models live under server/models/ when the process cwd is server/.
const modelsRoot = path.resolve(process.cwd(), 'models')
const onnxSessionPool = new SessionPool({
  maxSessions: 10,
  idleTimeoutMs: 1_800_000,
  maxQueueDepth: 50,
  frequentlyUsedModels: ['minilm'],
  resolveModelPath: (name) => resolveOnnxModelPath(modelsRoot, name),
  getModelSize: (name) => getOnnxModelSize(modelsRoot, name),
})
app.use('/api/onnx', requireAuth, createOnnxRouter(onnxSessionPool))

// Re-export for any modules that still import from index (backwards compat)
export { providerOrder, providerIsConfigured, callProvider, callProviderStream, getModelName }
export type { ProviderName }

/** Human-readable labels for intent types used in clarification messages. */
const INTENT_LABELS: Record<string, string> = {
  read: 'view some data',
  analyze: 'analyze your data',
  write: 'modify cells or rows',
  format: 'apply formatting',
  create_chart: 'create a chart',
  create_formula: 'create a formula',
  summarize: 'get a summary',
  filter: 'filter your data',
  sort: 'sort your data',
  clean: 'clean up the data',
  budget: 'work with a budget',
  report: 'generate a report',
  compare: 'compare data',
  find: 'find something specific',
  calculate: 'perform a calculation',
  export: 'export the data',
  chat: 'have a conversation',
  unknown: 'do something with your spreadsheet',
}

function buildClarificationMessage(intent: UserIntent): string {
  const label = INTENT_LABELS[intent.intentType] ?? 'do something with your spreadsheet'
  return `I'm not quite sure what you'd like to do. Did you mean to ${label}? Could you rephrase or give me a bit more detail?`
}

function sendSseComplete(
  res: express.Response,
  payload: ChatResponseBody & { errors?: string[] },
): void {
  res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
  res.end()
}

type LlmChatResult = ChatResponseBody & { usedServerProvider: boolean }

// ─── Decomposed Conditionals (business rule predicates) ──────────────────────

/** Whether the request has valid BYOK (Bring Your Own Key) credentials. */
function hasByokConfig(byok: ChatRequestBody['byok']): boolean {
  return Boolean(byok?.apiKey && byok?.baseUrl)
}

/** Whether a streaming call should be dispatched (requires both callback and signal). */
function shouldStream(stream: boolean, onChunk?: (chunk: string) => void, signal?: AbortSignal): boolean {
  return stream && Boolean(onChunk) && Boolean(signal)
}

/** Whether the LLM response merits a structured-output retry (act mode only, not streaming). */
function shouldRetryStructuredOutput(
  stream: boolean,
  parsedActions: unknown[],
  fullText: string,
  usedProvider: ProviderName | null,
): boolean {
  return !stream && parsedActions.length === 0 && fullText.trim().length > 0 && usedProvider !== null
}

/** Whether all AI providers have been exhausted without success. */
function allProvidersFailed(byokSucceeded: boolean, usedProvider: ProviderName | null): boolean {
  return !byokSucceeded && usedProvider === null
}

/**
 * Whether the request body carries a non-empty deterministic summary
 * that can serve as a partial fallback when the LLM is unreachable.
 */
function hasDeterministicFallback(context: ChatRequestBody['context']): boolean {
  if (!context || typeof context !== 'object') return false
  const summary = (context as { deterministicSummary?: string }).deterministicSummary
  return typeof summary === 'string' && summary.trim().length > 0
}

// ─── BYOK Call Helpers ───────────────────────────────────────────────────────

interface ByokCallResult {
  text: string
  meta: { provider: string; model: string }
}

async function callByokProvider(
  byok: NonNullable<ChatRequestBody['byok']>,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  stream: boolean,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<ByokCallResult> {
  const { chatWithOpenAiCompatibleStream, chatWithOpenAiCompatible } = await import('./openaiCompatible.js')
  const byokParams = { apiKey: byok.apiKey, model: byok.model, baseUrl: byok.baseUrl }

  let text: string
  if (shouldStream(stream, onChunk, signal)) {
    text = await chatWithOpenAiCompatibleStream(byokParams, messages, onChunk!, signal!)
  } else {
    text = await chatWithOpenAiCompatible(byokParams, messages)
  }

  let byokHost = 'custom'
  try { byokHost = new URL(byok.baseUrl).hostname } catch { /* keep 'custom' */ }

  return {
    text,
    meta: {
      provider: byok.provider?.trim() || byokHost || 'byok',
      model: byok.model?.trim() || 'unknown-model',
    },
  }
}

// ─── Server Provider Loop ────────────────────────────────────────────────────

interface ServerProviderResult {
  text: string
  provider: ProviderName
  meta: { provider: string; model: string }
}

async function callServerProviders(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  providers: ProviderName[],
  llmOnly: boolean,
  stream: boolean,
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<{ result: ServerProviderResult | null; errors: string[] }> {
  const providerErrors: string[] = []
  const providerOpts = { jsonMode: !llmOnly, maxTokens: llmOnly ? undefined : 2048 }

  for (const provider of providers) {
    if (isCircuitOpen(provider)) {
      providerErrors.push(`${provider}: circuit open (skipped)`)
      continue
    }

    try {
      let text: string
      if (shouldStream(stream, onChunk, signal)) {
        const response = await callProviderStream(provider, messages, onChunk!, signal!, providerOpts)
        text = response.text
      } else {
        const response = await callProvider(provider, messages, providerOpts)
        text = response.text
      }

      recordSuccess(provider)
      return {
        result: { text, provider, meta: { provider, model: getModelName(provider) } },
        errors: providerErrors,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      providerErrors.push(`${provider}: ${msg}`)
      console.warn(`[llm] provider ${provider} failed:`, msg)
      recordFailure(provider)

      if (provider === 'groq') {
        const { recordGroqFallback } = await import('./providers.js')
        recordGroqFallback()
      }
    }
  }

  return { result: null, errors: providerErrors }
}

// ─── Main LLM Chat Function ─────────────────────────────────────────────────

async function runLlmChat(params: {
  body: ChatRequestBody
  userMessage: string
  mode: ReturnType<typeof classifyMode>
  intent: ReturnType<typeof resolveIntent>
  userIntent: UserIntent
  stream: boolean
  /** When true, never fall through to app-funded providers after BYOK failure. */
  byokOnly?: boolean
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
}): Promise<LlmChatResult> {
  const { body, userMessage, mode, intent, userIntent, stream, byokOnly = false, onChunk, signal } = params
  const llmOnly = isLlmOnlyMode(mode) || Boolean(body.forceLlm)

  const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')

  // ─── Token budget — determine context ceiling for the target provider ─────
  const isCloudAvailable = providerOrder().filter(providerIsConfigured)
    .some((p) => p !== 'ollama')
  const targetProvider: BudgetProvider = isCloudAvailable
    ? (providerOrder().find((p) => p !== 'ollama' && providerIsConfigured(p)) as BudgetProvider ?? 'ollama')
    : 'ollama'

  // Build system prompt with budget-aware context truncation
  // First pass: build without context to measure base prompt cost
  const basePrompt = llmOnly
    ? buildExplainPrompt(undefined, mode, userIntent)
    : buildActionPrompt(undefined)
  const basePromptTokens = estimateTokens(basePrompt)

  // Allocate budget to determine how much context we can include
  const budget = allocateBudget({
    provider: targetProvider,
    systemPromptText: basePrompt,
    historyMessages: history,
    userMessageText: userMessage,
  })

  // Now build the real prompt with context, capping at the budget's context allocation
  const maxContextTokens = budget.isConstrained ? budget.context : undefined
  const systemPrompt = llmOnly
    ? buildExplainPrompt(body.context, mode, userIntent, maxContextTokens)
    : buildActionPrompt(body.context, maxContextTokens)

  // Few-shot examples for explain/advise mode — teaches the model the response style.
  const contextSize = systemPrompt.length
  const maxExamples = contextSize > 3000 ? 4 : FEW_SHOT_EXAMPLES.length
  const fewShot: Array<{ role: 'user' | 'assistant'; content: string }> = llmOnly
    ? FEW_SHOT_EXAMPLES.slice(0, maxExamples)
    : []

  // ─── Conversation history — use larger window for cloud providers ───────────
  const maxHistory = isCloudAvailable ? config.maxHistoryCloud : config.maxHistoryLocal

  let conversationSummary: string | null = null
  let trimmedHistory = history
  if (history.length > maxHistory) {
    const older = history.slice(0, -(maxHistory - 2))
    trimmedHistory = history.slice(-(maxHistory - 2))

    const userTopics = older
      .filter((m) => m.role === 'user')
      .map((m) => m.content.slice(0, 80).replace(/\n/g, ' ').trim())
      .slice(-4)
    if (userTopics.length > 0) {
      conversationSummary = `[Earlier in this conversation, the user asked about: ${userTopics.join('; ')}]`
    }
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...fewShot.map((m) => ({ role: m.role, content: m.content })),
    ...(conversationSummary
      ? [{ role: 'system' as const, content: conversationSummary }]
      : []),
    ...trimmedHistory,
    { role: 'user', content: userMessage },
  ]

  let fullText = ''
  let usedProvider: ProviderName | null = null
  let providerMeta: { provider: string; model: string } | null = null
  let byokSucceeded = false
  const providerErrors: string[] = []

  // ─── Phase 1: Try BYOK if configured ───────────────────────────────────────
  if (hasByokConfig(body.byok)) {
    try {
      const byokResult = await callByokProvider(body.byok!, messages, stream, onChunk, signal)
      fullText = byokResult.text
      providerMeta = byokResult.meta
      byokSucceeded = true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      providerErrors.push(`byok(${body.byok!.provider}): ${msg}`)
      console.warn(`[llm] BYOK provider failed:`, msg)
    }
  }

  // ─── Phase 1b: BYOK-only mode exhausted ────────────────────────────────────
  if (!byokSucceeded && byokOnly) {
    return {
      message:
        'Your own API key failed, and you have used all free AI questions for today. ' +
        'Fix your BYOK key/settings or upgrade to Pro for unlimited access.',
      actions: [],
      source: 'fallback',
      usedServerProvider: false,
    }
  }

  // ─── Phase 2: Try server-configured providers ──────────────────────────────
  if (!byokSucceeded) {
    const availableProviders = providerOrder().filter(providerIsConfigured)
    const { result, errors } = await callServerProviders(
      messages, availableProviders, llmOnly, stream, onChunk, signal,
    )
    providerErrors.push(...errors)

    if (result) {
      fullText = result.text
      usedProvider = result.provider
      providerMeta = result.meta
    }
  }

  // ─── Phase 3: All providers failed — return fallback ───────────────────────
  if (allProvidersFailed(byokSucceeded, usedProvider)) {
    if (providerErrors.length) {
      console.warn('[llm] all providers failed:', providerErrors.join(' | '))
    }
    return {
      message: intent.message || (hasDeterministicFallback(body.context)
        ? '⚠️ AI is currently unavailable. The analysis above is based on local calculations only — for deeper questions, please try again in a moment.'
        : '⚠️ AI is currently unavailable. Please check your connection or try again in a moment.'),
      actions: llmOnly ? [] : intent.actions,
      source: 'fallback',
      usedServerProvider: false,
    }
  }

  // ─── Phase 4: Explain/advise mode — return LLM text directly ───────────────
  if (llmOnly) {
    const text = fullText.trim()
    return {
      message: text || 'I could not generate a response. Try rephrasing your question.',
      actions: [],
      source: 'llm',
      meta: providerMeta ?? undefined,
      usedServerProvider: Boolean(usedProvider),
    }
  }

  // ─── Phase 5: Act mode — parse structured output ───────────────────────────
  let parsed = parseAgentResponse(fullText)

  // Structured output retry: if response doesn't parse to actions, try once more
  // with a correction hint (non-streaming only, server providers only).
  if (shouldRetryStructuredOutput(stream, parsed.actions, fullText, usedProvider)) {
    const retryHint: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      ...messages,
      { role: 'assistant', content: fullText },
      { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY a JSON object containing "message" (string) and "actions" (array of {tool, params, description}). No markdown, no explanation, just the JSON object.' },
    ]
    try {
      const retryResponse = await callProvider(usedProvider!, retryHint, { jsonMode: true, maxTokens: 2048 })
      const retryParsed = parseAgentResponse(retryResponse.text)
      if (retryParsed.actions.length > 0) {
        parsed = retryParsed
      }
    } catch {
      // Retry failed — continue with original parsed result
    }
  }

  if (isWeakResponse(parsed.message, parsed.actions)) {
    parsed = {
      message: intent.message || fullText || 'Try a specific request like "build a monthly budget".',
      actions: intent.actions,
    }
  }

  return {
    message: parsed.message,
    actions: parsed.actions,
    source: 'llm',
    meta: providerMeta ?? undefined,
    usedServerProvider: Boolean(usedProvider),
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false
  const groq = groqAvailable()
  const openrouter = providerIsConfigured('openrouter')
  const huggingface = providerIsConfigured('huggingface')

  // Public: only expose operational status (ok/not ok)
  const isOk = groq || openrouter || huggingface || (ollama && modelReady)

  // Authenticated requests get full diagnostics; public gets minimal status
  const userId = getRequestUserId(req)
  if (!userId) {
    res.json({ ok: isOk, service: 'smartsht-server' })
    return
  }

  const order = providerOrder()
  const [db, s3] = await Promise.all([dbHealthCheck(), s3HealthCheck()])
  const { getGroqUsageStats } = await import('./groq.js')

  res.json({
    ok: isOk,
    service: 'smartsht-server',
    groq,
    openrouter,
    huggingface,
    providerOrder: order,
    groqModel: groq ? config.groqModel : null,
    groqUsage: groq ? getGroqUsageStats() : null,
    ollama,
    modelRegistered: modelReady,
    modelName: config.modelName,
    cloud: {
      database: db,
      s3: s3,
    },
  })
})

// ─── AI Health endpoint ──────────────────────────────────────────────────────

app.get('/api/health/ai', requireAuth, async (req, res) => {
  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false
  const groq = groqAvailable()
  const openrouter = providerIsConfigured('openrouter')
  const huggingface = providerIsConfigured('huggingface')
  const { getGroqUsageStats } = await import('./groq.js')
  const groqStats = groq ? getGroqUsageStats() : null

  res.json({
    providers: {
      groq: {
        configured: groq,
        healthy: groq, // Groq is healthy if the API key is present (actual check is per-call)
        model: groq ? config.groqModel : null,
        remainingRequests: groqStats?.remainingRequests ?? null,
        rateLimitsToday: groqStats?.rateLimitsToday ?? 0,
      },
      openrouter: {
        configured: openrouter,
        healthy: openrouter,
        model: openrouter ? config.openRouterModel : null,
      },
      huggingface: {
        configured: huggingface,
        healthy: huggingface,
        model: huggingface ? config.huggingFaceModel : null,
      },
      ollama: {
        configured: true,
        healthy: ollama && modelReady,
        model: config.modelName,
        reachable: ollama,
        modelRegistered: modelReady,
      },
    },
    providerOrder: providerOrder(),
    consecutiveFallbacks: groqStats?.consecutiveFallbacks ?? 0,
    lastFallbackAt: groqStats?.lastRateLimitAt ?? null,
  })
})

// ─── Streaming SSE endpoint (primary) ────────────────────────────────────────

app.post('/api/chat/stream', requireAuth, chatRateLimiter, validateBody(chatStreamBodySchema), async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const mode = classifyMode(userMessage)
  const userIntent = parseIntentWithKeyword(userMessage)

  // Generate contextual suggestions using sheet metadata when available
  const sheetCtx = body.context ? {
    detectedPurpose: body.context.profile?.detectedPurpose,
    hasMultipleSheets: (body.context.sheetNames?.length ?? 0) > 1,
    sheetNames: body.context.sheetNames,
    hasDateColumn: body.context.profile?.columns?.some((c) => c.role === 'date'),
    hasCategoryColumn: body.context.profile?.columns?.some((c) => c.role === 'category'),
    categoryColumnName: body.context.profile?.columns?.find((c) => c.role === 'category')?.name,
    hasOutliers: Boolean(body.context.insights?.columnStats?.some((c) => c.sum !== undefined)),
    hasFinancialData: Boolean(body.context.insights?.totalIncome || body.context.insights?.totalExpenses),
  } : undefined
  const suggestions = getContextualServerSuggestions(userMessage, sheetCtx)

  // Low-confidence intent — clarify only for action requests (avoid blocking explain/advise Q&A)
  if (
    userIntent.confidence < config.intentConfidenceThreshold
    && !isLlmOnlyMode(mode)
    && mode !== 'help'
  ) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    sendSseComplete(res, {
      message: buildClarificationMessage(userIntent),
      actions: [],
      source: 'clarification',
      suggestions,
    })
    return
  }

  const intent = resolveIntent(userMessage)
  const llmOnly = isLlmOnlyMode(mode) || body.forceLlm

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // Static help response
  if (mode === 'help' && !body.forceLlm) {
    sendSseComplete(res, { message: intent.message, actions: [], source: 'template', suggestions })
    return
  }

  // Act-mode template fast path
  if (!llmOnly && (intent.actions.length > 0 || intent.message.length > 0)) {
    sendSseComplete(res, {
      message: intent.message,
      actions: intent.actions,
      source: 'template',
      suggestions,
    })
    return
  }

  // ─── Usage gate (free tier enforcement) ────────────────────────────────────
  // BYOK credentials alone do NOT grant Pro. Over-quota free users may attempt
  // BYOK-only; server providers stay locked until BYOK succeeds or they upgrade.
  const hasByokCredentials = Boolean(body.byok?.apiKey && body.byok?.baseUrl)
  const userId = getRequestUserId(req) ?? undefined
  const isPro = await resolveIsPro(userId ?? null)
  const usage = await checkUsage(userId, isPro)
  const access = decideAiAccess({
    isPro,
    usageAllowed: usage.allowed,
    hasByokCredentials,
    dailyLimit: usage.limit,
  })

  if (!access.allowed) {
    sendSseComplete(res, {
      message: access.denialMessage ?? `You've used all ${usage.limit} free AI questions for today. Upgrade to Pro for unlimited access.`,
      actions: [],
      source: 'fallback',
    })
    return
  }

  res.flushHeaders()

  // Abort on client disconnect or hard timeout (120s)
  const reqAbort = new AbortController()
  const reqTimeout = setTimeout(() => reqAbort.abort(), 120_000)
  req.on('close', () => {
    clearTimeout(reqTimeout)
    reqAbort.abort()
  })

  // Separate signal for LLM — timeout-based only, not tied to req close race condition
  const llmAbort = new AbortController()
  const llmTimeout = setTimeout(() => llmAbort.abort(), 90_000)

  try {
    const result = await runLlmChat({
      body,
      userMessage,
      mode,
      intent,
      userIntent,
      stream: true,
      byokOnly: access.byokOnly,
      onChunk: (chunk) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`)
        }
      },
      signal: llmAbort.signal,
    })

    clearTimeout(llmTimeout)
    clearTimeout(reqTimeout)

    const { usedServerProvider, ...payload } = result

    // Meter only app-funded inference for free users
    if (result.source === 'llm' && shouldRecordServerUsage({ usedServerProvider, isPro })) {
      await recordUsage(userId)
    }

    if (!res.writableEnded) {
      sendSseComplete(res, { ...payload, suggestions })
    }
  } catch (err) {
    clearTimeout(llmTimeout)
    clearTimeout(reqTimeout)

    if (!res.writableEnded) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      sendSseComplete(res, {
        message: `${intent.message || 'Something went wrong.'}\n\n(${message})`,
        actions: llmOnly ? [] : intent.actions,
        source: 'fallback',
        suggestions,
      })
    }
  }
})

// ─── Classic JSON endpoint (non-streaming, kept for compatibility) ────────────

app.post('/api/chat', requireAuth, chatRateLimiter, validateBody(chatBodySchema), async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  // ─── Usage gate (free tier enforcement) ────────────────────────────────────
  const hasByokCredentials = Boolean(body.byok?.apiKey && body.byok?.baseUrl)
  const userId = getRequestUserId(req) ?? undefined
  const isPro = await resolveIsPro(userId ?? null)
  const usage = await checkUsage(userId, isPro)
  const access = decideAiAccess({
    isPro,
    usageAllowed: usage.allowed,
    hasByokCredentials,
    dailyLimit: usage.limit,
  })

  if (!access.allowed) {
    res.status(429).json({
      message: access.denialMessage ?? `You've used all ${usage.limit} free AI questions for today. Upgrade to Pro for unlimited access.`,
      actions: [],
      source: 'fallback',
    })
    return
  }

  const mode = classifyMode(userMessage)
  const userIntent = parseIntentWithKeyword(userMessage)

  // Generate contextual suggestions using sheet metadata when available
  const sheetCtx = body.context ? {
    detectedPurpose: body.context.profile?.detectedPurpose,
    hasMultipleSheets: (body.context.sheetNames?.length ?? 0) > 1,
    sheetNames: body.context.sheetNames,
    hasDateColumn: body.context.profile?.columns?.some((c) => c.role === 'date'),
    hasCategoryColumn: body.context.profile?.columns?.some((c) => c.role === 'category'),
    categoryColumnName: body.context.profile?.columns?.find((c) => c.role === 'category')?.name,
    hasOutliers: Boolean(body.context.insights?.columnStats?.some((c) => c.sum !== undefined)),
    hasFinancialData: Boolean(body.context.insights?.totalIncome || body.context.insights?.totalExpenses),
  } : undefined
  const suggestions = getContextualServerSuggestions(userMessage, sheetCtx)

  // Low-confidence intent — clarify only for action requests (avoid blocking explain/advise Q&A)
  if (
    userIntent.confidence < config.intentConfidenceThreshold
    && !isLlmOnlyMode(mode)
    && mode !== 'help'
  ) {
    res.json({
      message: buildClarificationMessage(userIntent),
      actions: [],
      source: 'clarification',
      suggestions,
    })
    return
  }

  const intent = resolveIntent(userMessage)
  const llmOnly = isLlmOnlyMode(mode) || body.forceLlm

  if (mode === 'help' && !body.forceLlm) {
    res.json({ message: intent.message, actions: [], source: 'template', suggestions })
    return
  }

  if (!llmOnly && (intent.actions.length > 0 || intent.message.length > 0)) {
    res.json({
      message: intent.message,
      actions: intent.actions,
      source: intent.actions.length > 0 ? 'template' : 'fallback',
      suggestions,
    })
    return
  }

  try {
    const result = await runLlmChat({
      body,
      userMessage,
      mode,
      intent,
      userIntent,
      stream: false,
      byokOnly: access.byokOnly,
    })
    const { usedServerProvider, ...payload } = result
    if (result.source === 'llm' && shouldRecordServerUsage({ usedServerProvider, isPro })) {
      await recordUsage(userId)
    }
    res.json({ ...payload, suggestions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.json({
      message: `${intent.message || 'Something went wrong.'}\n\n(${message})`,
      actions: llmOnly ? [] : intent.actions,
      source: 'fallback',
      suggestions,
    })
  }
})

// ─── Usage check endpoint ────────────────────────────────────────────────────

app.post('/api/usage', requireAuth, async (req, res) => {
  const userId = getRequestUserId(req)
  const isPro = await resolveIsPro(userId)
  const stats = await getUsageStats(userId ?? undefined, isPro)
  res.json(stats)
})

// ─── Stripe Checkout ─────────────────────────────────────────────────────────

app.post('/api/checkout', requireAuth, checkoutRateLimiter, async (req, res) => {
  const userId = getRequestUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const bodyEmail = (req.body as { email?: string }).email
  let email = bodyEmail ?? ''
  try {
    const user = await getClerkClient().users.getUser(userId)
    email = email || user.emailAddresses[0]?.emailAddress || ''
  } catch {
    // fall through with body email
  }

  if (!email) {
    res.status(400).json({ error: 'email is required' })
    return
  }

  try {
    const { createCheckoutSession } = await import('./stripe.js')
    const interval = (req.body as { interval?: string }).interval === 'annual' ? 'annual' : 'monthly'
    const session = await createCheckoutSession(userId, email, interval)
    res.json({ url: session.url })
  } catch (err) {
    // Stripe errors can embed account/price details — log, don't echo
    const errorId = randomUUID().slice(0, 8)
    console.error(`[checkout] (${errorId})`, err)
    res.status(500).json({ error: 'Could not start checkout. Please try again.', errorId })
  }
})

// ─── Error handler ───────────────────────────────────────────────────────────
// Must be registered last. Without it Express falls back to its default HTML
// handler, which renders a stack trace (absolute file paths and all) to the
// client — most visibly on body-size 413s.

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err)
    return
  }

  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode
    ?? 500

  if (status === 413) {
    res.status(413).json({
      error: 'Request too large. Try removing unused rows or splitting the workbook.',
    })
    return
  }

  if (status === 400 && err instanceof SyntaxError) {
    res.status(400).json({ error: 'Malformed JSON body.' })
    return
  }

  const errorId = randomUUID().slice(0, 8)
  console.error(`[server] Unhandled error (${errorId})`, err)
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: 'Something went wrong on our end. Please try again.',
    errorId,
  })
})

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.port, config.host, () => {
  console.log(`smartsh!t server listening on http://${config.host}:${config.port}`)
  console.log(`Provider order: ${providerOrder().join(' -> ')}`)
  console.log(`OpenRouter: ${providerIsConfigured('openrouter') ? `✓ (${config.openRouterModel})` : '✗ (no API key)'}`)
  console.log(`HuggingFace: ${providerIsConfigured('huggingface') ? `✓ (${config.huggingFaceModel})` : '✗ (no API key)'}`)
  console.log(`Groq: ${groqAvailable() ? `✓ (${config.groqModel})` : '✗ (no API key)'}`)
  console.log(`Ollama: ${config.ollamaBaseUrl} (model: ${config.modelName})`)
  console.log(`Stripe: ${config.stripeSecretKey ? '✓' : '✗ (no secret key)'}`)
  console.log(`Clerk: ${config.clerkSecretKey ? '✓ (SmartSht secret configured)' : '✗'}`)
  console.log(`Database: ${config.databaseUrl ? '✓ (configured)' : '✗ (no DATABASE_URL)'}`)
  console.log(`S3: ${config.awsAccessKeyId ? `✓ (${config.s3Bucket})` : '✗ (no AWS credentials)'}`)
  const minilmPath = resolveOnnxModelPath(modelsRoot, 'minilm')
  console.log(`ONNX Path B: ${fs.existsSync(minilmPath) ? `✓ (${minilmPath})` : `✗ (no model at ${minilmPath} — run npm run model:copy-deploy)`}`)

  onnxSessionPool.startReaper()
  void onnxSessionPool.warmup().then(() => {
    const status = onnxSessionPool.getStatus()
    console.log(`ONNX session pool: warmed ${status.loaded} model(s)`)
  })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — closing connections...')
  await onnxSessionPool.dispose()
  await closePool()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received — closing connections...')
  await onnxSessionPool.dispose()
  await closePool()
  process.exit(0)
})

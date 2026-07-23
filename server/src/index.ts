import cors from 'cors'
import express from 'express'
import { clerkMiddleware } from '@clerk/express'
import { config } from './config.js'
import { modelIsRegistered, ollamaReachable } from './ollama.js'
import { assistModelAvailable } from './ollama.js'
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
import { getSuggestions, getContextualServerSuggestions } from './suggestions.js'
import {
  type ProviderName,
  providerOrder,
  providerIsConfigured,
  callProvider,
  callProviderStream,
} from './providers.js'

import { checkUsage, recordUsage, getUsageStats } from './usage.js'
import { dbHealthCheck, closePool } from './db.js'
import { s3HealthCheck } from './s3.js'
import { workbooksRouter } from './routes/workbooks.js'
import { versionsRouter } from './routes/versions.js'
import { sharesRouter } from './routes/shares.js'
import { templatesRouter } from './routes/templates.js'
import { aiFunctionRouter } from './routes/aiFunction.js'
import { requireAuth, getRequestUserId, getClerkClient, planFromPublicMetadata } from './auth/clerk.js'

// ─── Pro plan cache (avoids hitting Clerk API on every chat message) ─────────
const PRO_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const proCache = new Map<string, { isPro: boolean; expiresAt: number }>()

async function resolveIsPro(userId: string | null): Promise<boolean> {
  if (!userId || !config.clerkSecretKey) return false

  const cached = proCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.isPro
  }

  try {
    const user = await getClerkClient().users.getUser(userId)
    const isPro = planFromPublicMetadata(user.publicMetadata as Record<string, unknown>) === 'pro'
    proCache.set(userId, { isPro, expiresAt: Date.now() + PRO_CACHE_TTL_MS })
    return isPro
  } catch {
    // On error, return cached value if available (even if expired), otherwise false
    return cached?.isPro ?? false
  }
}

const app = express()
app.use(cors({ origin: config.corsOrigin }))

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
      proCache.delete(result.userId)
      console.log(`Stripe webhook: user ${result.userId} -> plan ${result.plan}`)
    }

    res.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    console.error('Stripe webhook error:', message)
    res.status(400).json({ error: message })
  }
})

app.use(clerkMiddleware())
app.use(express.json({ limit: '1mb' }))

// ─── Cloud workbook routes (Clerk JWT required) ──────────────────────────────
app.use('/api/workbooks', requireAuth, workbooksRouter)
app.use('/api/workbooks', requireAuth, versionsRouter)
app.use('/api/workbooks', requireAuth, sharesRouter)
app.use('/api', sharesRouter)  // Public GET /api/shared/:token; mutating routes check auth in-handler
app.use('/api/community-templates', templatesRouter)

// ─── AI Function endpoint (formula-level AI calls) ───────────────────────────
app.use('/api/ai-function', aiFunctionRouter)

// Re-export for any modules that still import from index (backwards compat)
export { providerOrder, providerIsConfigured, callProvider, callProviderStream }
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

async function runLlmChat(params: {
  body: ChatRequestBody
  userMessage: string
  mode: ReturnType<typeof classifyMode>
  intent: ReturnType<typeof resolveIntent>
  userIntent: UserIntent
  stream: boolean
  onChunk?: (chunk: string) => void
  signal?: AbortSignal
}): Promise<ChatResponseBody> {
  const { body, userMessage, mode, intent, userIntent, stream, onChunk, signal } = params
  const llmOnly = isLlmOnlyMode(mode) || body.forceLlm

  const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
  const systemPrompt = llmOnly
    ? buildExplainPrompt(body.context, mode, userIntent)
    : buildActionPrompt(body.context)

  // Few-shot examples for explain/advise mode — teaches the model the response style.
  // Full library lives in prompts/fewShot.ts (8 examples covering audit, budget,
  // formula help, debugging, teaching, vague requests, off-topic, and performance).
  // Token budget: when context is large (>3k chars), trim to 4 examples to leave
  // room for actual data. The first 4 cover the most critical patterns (audit,
  // budget, formula, debugging).
  const contextSize = systemPrompt.length
  const maxExamples = contextSize > 3000 ? 4 : FEW_SHOT_EXAMPLES.length
  const fewShot: Array<{ role: 'user' | 'assistant'; content: string }> = llmOnly
    ? FEW_SHOT_EXAMPLES.slice(0, maxExamples)
    : []

  // ─── Conversation history — use larger window for cloud providers ───────────
  // Cloud providers (Groq, OpenRouter, HuggingFace) have 128K+ context windows.
  // Local Ollama has a smaller window. Adapt history length accordingly.
  const isCloudAvailable = providerOrder().filter(providerIsConfigured)
    .some((p) => p !== 'ollama')
  const maxHistory = isCloudAvailable ? config.maxHistoryCloud : config.maxHistoryLocal

  // Summarize older messages into a brief context note when history is long
  let conversationSummary: string | null = null
  let trimmedHistory = history
  if (history.length > maxHistory) {
    const older = history.slice(0, -(maxHistory - 2))
    trimmedHistory = history.slice(-(maxHistory - 2))

    // Build a brief summary of older messages
    const userTopics = older
      .filter((m) => m.role === 'user')
      .map((m) => m.content.slice(0, 80).replace(/\n/g, ' ').trim())
      .slice(-4)
    if (userTopics.length > 0) {
      conversationSummary = `[Earlier in this conversation, the user asked about: ${userTopics.join('; ')}]`
    }
  }

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...fewShot.map((m) => ({ role: m.role, content: m.content })),
    ...(conversationSummary
      ? [{ role: 'system' as const, content: conversationSummary }]
      : []),
    ...trimmedHistory,
    { role: 'user' as const, content: userMessage },
  ]
  const byok = body.byok
  const availableProviders = providerOrder().filter(providerIsConfigured)
  let fullText = ''
  let usedProvider: ProviderName | null = null
  const providerErrors: string[] = []

  if (byok?.apiKey && byok?.baseUrl) {
    try {
      const { chatWithOpenAiCompatibleStream, chatWithOpenAiCompatible } = await import('./openaiCompatible.js')
      const byokParams = { apiKey: byok.apiKey, model: byok.model, baseUrl: byok.baseUrl }
      if (stream && onChunk && signal) {
        fullText = await chatWithOpenAiCompatibleStream(byokParams, messages, onChunk, signal)
      } else {
        fullText = await chatWithOpenAiCompatible(byokParams, messages)
      }
      usedProvider = 'openrouter' // label it generically
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      providerErrors.push(`byok(${byok.provider}): ${msg}`)
      console.warn(`[llm] BYOK provider failed:`, msg)
      // Fall through to server-configured providers
    }
  }

  if (!usedProvider) {
    for (const provider of availableProviders) {
      try {
        if (stream && onChunk && signal) {
          fullText = await callProviderStream(provider, messages, onChunk, signal)
        } else {
          fullText = await callProvider(provider, messages)
        }
        usedProvider = provider
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        providerErrors.push(`${provider}: ${msg}`)
        console.warn(`[llm] provider ${provider} failed:`, msg)
      }
    }
  }

  if (!usedProvider) {
    if (providerErrors.length) {
      console.warn('[llm] all providers failed:', providerErrors.join(' | '))
    }
    // When ALL AI providers failed, be honest about it — don't let local
    // deterministic analysis pretend to answer questions it can't.
    const hasDeterministic = Boolean(
      body.context && typeof body.context === 'object'
      && 'deterministicSummary' in body.context
      && String((body.context as { deterministicSummary?: string }).deterministicSummary ?? '').trim(),
    )
    return {
      message: intent.message || (hasDeterministic
        ? '⚠️ AI is currently unavailable. The analysis above is based on local calculations only — for deeper questions, please try again in a moment.'
        : '⚠️ AI is currently unavailable. Please check your connection or try again in a moment.'),
      actions: llmOnly ? [] : intent.actions,
      source: 'fallback',
    }
  }

  if (llmOnly) {
    const text = fullText.trim()
    return {
      message: text || 'I could not generate a response. Try rephrasing your question.',
      actions: [],
      source: 'llm',
    }
  }

  let parsed = parseAgentResponse(fullText)
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
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false
  const assistReady = ollama ? await assistModelAvailable() : false
  const groq = groqAvailable()
  const openrouter = providerIsConfigured('openrouter')
  const huggingface = providerIsConfigured('huggingface')
  const order = providerOrder()

  // Cloud infrastructure checks
  const [db, s3] = await Promise.all([dbHealthCheck(), s3HealthCheck()])

  res.json({
    ok: groq || openrouter || huggingface || (ollama && modelReady),
    service: 'smartsht-server',
    groq,
    openrouter,
    huggingface,
    providerOrder: order,
    groqModel: groq ? config.groqModel : null,
    ollama,
    modelRegistered: modelReady,
    assistModelRegistered: assistReady,
    modelName: config.modelName,
    assistModelName: config.assistModelName,
    port: config.port,
    cloud: {
      database: db,
      s3: s3,
    },
  })
})

// ─── Streaming SSE endpoint (primary) ────────────────────────────────────────

app.post('/api/chat/stream', requireAuth, async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const mode = classifyMode(userMessage)
  const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
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
  // BYOK users bypass the limit — they're paying for their own tokens
  const hasByok = Boolean(body.byok?.apiKey && body.byok?.baseUrl)
  const userId = getRequestUserId(req) ?? undefined
  const isPro = hasByok || await resolveIsPro(userId ?? null)
  const usage = checkUsage(userId, isPro)

  if (!usage.allowed) {
    sendSseComplete(res, {
      message: `You've used all ${usage.limit} free AI questions for today. Upgrade to Pro for unlimited access.`,
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
      onChunk: (chunk) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`)
        }
      },
      signal: llmAbort.signal,
    })

    clearTimeout(llmTimeout)
    clearTimeout(reqTimeout)

    // Record usage for free-tier tracking (only after successful LLM response)
    if (result.source === 'llm') {
      recordUsage(userId)
    }

    if (!res.writableEnded) {
      sendSseComplete(res, { ...result, suggestions })
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

app.post('/api/chat', requireAuth, async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const mode = classifyMode(userMessage)
  const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
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
    })
    res.json({ ...result, suggestions })
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
  const stats = getUsageStats(userId ?? undefined, isPro)
  res.json(stats)
})

// ─── Stripe Checkout ─────────────────────────────────────────────────────────

app.post('/api/checkout', requireAuth, async (req, res) => {
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
    const session = await createCheckoutSession(userId, email)
    res.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    res.status(500).json({ error: message })
  }
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
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received — closing connections...')
  await closePool()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received — closing connections...')
  await closePool()
  process.exit(0)
})

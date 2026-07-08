import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { chatWithOllama, chatWithOllamaStream, modelIsRegistered, ollamaReachable } from './ollama.js'
import { groqAvailable, chatWithGroqStream } from './groq.js'
import { chatWithOpenAiCompatible, chatWithOpenAiCompatibleStream, openAiCompatibleAvailable } from './openaiCompatible.js'
import {
  buildActionPrompt,
  buildExplainPrompt,
  type ChatRequestBody,
  type ChatResponseBody,
} from './prompt.js'
import { parseAgentResponse } from './parseResponse.js'
import { resolveIntent, isWeakResponse } from './intent.js'
import { classifyMode, isLlmOnlyMode } from './mode.js'
import { parseUserIntent } from './intentParser.js'
import type { UserIntent } from '../../shared/intentTypes.js'

import { checkUsage, recordUsage, getUsageStats } from './usage.js'

const app = express()
app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: '1mb' }))

type ProviderName = 'openrouter' | 'huggingface' | 'groq' | 'ollama'

function providerOrder(): ProviderName[] {
  const allowed: ProviderName[] = ['openrouter', 'huggingface', 'groq', 'ollama']
  return config.llmProviderOrder.filter((provider): provider is ProviderName =>
    allowed.includes(provider as ProviderName),
  )
}

function providerIsConfigured(provider: ProviderName): boolean {
  if (provider === 'openrouter') {
    return openAiCompatibleAvailable({
      apiKey: config.openRouterApiKey,
      model: config.openRouterModel,
      baseUrl: config.openRouterBaseUrl,
    })
  }
  if (provider === 'huggingface') {
    return openAiCompatibleAvailable({
      apiKey: config.huggingFaceApiKey,
      model: config.huggingFaceModel,
      baseUrl: config.huggingFaceBaseUrl,
    })
  }
  if (provider === 'groq') return groqAvailable()
  return true
}

async function callProviderStream(
  provider: ProviderName,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<string> {
  if (provider === 'openrouter') {
    return chatWithOpenAiCompatibleStream(
      {
        apiKey: config.openRouterApiKey,
        model: config.openRouterModel,
        baseUrl: config.openRouterBaseUrl,
      },
      messages,
      onChunk,
      signal,
    )
  }
  if (provider === 'huggingface') {
    return chatWithOpenAiCompatibleStream(
      {
        apiKey: config.huggingFaceApiKey,
        model: config.huggingFaceModel,
        baseUrl: config.huggingFaceBaseUrl,
      },
      messages,
      onChunk,
      signal,
    )
  }
  if (provider === 'groq') return chatWithGroqStream(messages, onChunk, signal)

  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false
  if (!ollama || !modelReady) throw new Error('Ollama is unavailable or model is not registered')
  return chatWithOllamaStream(messages, onChunk, signal)
}

async function callProvider(provider: ProviderName, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
  if (provider === 'openrouter') {
    return chatWithOpenAiCompatible(
      {
        apiKey: config.openRouterApiKey,
        model: config.openRouterModel,
        baseUrl: config.openRouterBaseUrl,
      },
      messages,
    )
  }
  if (provider === 'huggingface') {
    return chatWithOpenAiCompatible(
      {
        apiKey: config.huggingFaceApiKey,
        model: config.huggingFaceModel,
        baseUrl: config.huggingFaceBaseUrl,
      },
      messages,
    )
  }
  if (provider === 'groq') {
    const { chatWithGroq } = await import('./groq.js')
    return chatWithGroq(messages)
  }
  return chatWithOllama(messages)
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

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.slice(-4),
    { role: 'user' as const, content: userMessage },
  ]

  const availableProviders = providerOrder().filter(providerIsConfigured)
  const providerErrors: string[] = []
  let fullText = ''
  let usedProvider: ProviderName | null = null

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
      const message = err instanceof Error ? err.message : 'Unknown error'
      providerErrors.push(`${provider}: ${message}`)
    }
  }

  if (!usedProvider) {
    return {
      message:
        intent.message ||
        'AI is currently unavailable. Configure OPENROUTER_API_KEY, HUGGINGFACE_API_KEY, GROQ_API_KEY, or a local Ollama model.',
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
  const groq = groqAvailable()
  const openrouter = providerIsConfigured('openrouter')
  const huggingface = providerIsConfigured('huggingface')
  const order = providerOrder()

  res.json({
    ok: groq || openrouter || huggingface || (ollama && modelReady),
    service: 'smartshit-server',
    groq,
    openrouter,
    huggingface,
    providerOrder: order,
    groqModel: groq ? config.groqModel : null,
    ollama,
    modelRegistered: modelReady,
    modelName: config.modelName,
    port: config.port,
  })
})

// ─── Streaming SSE endpoint (primary) ────────────────────────────────────────

app.post('/api/chat/stream', async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const mode = classifyMode(userMessage)
  const userIntent = parseUserIntent(userMessage)
  const intent = resolveIntent(userMessage)
  const llmOnly = isLlmOnlyMode(mode) || body.forceLlm

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // Static help response
  if (mode === 'help' && !body.forceLlm) {
    sendSseComplete(res, { message: intent.message, actions: [], source: 'template' })
    return
  }

  // Act-mode template fast path
  if (!llmOnly && (intent.actions.length > 0 || intent.message.length > 0)) {
    sendSseComplete(res, {
      message: intent.message,
      actions: intent.actions,
      source: 'template',
    })
    return
  }

  // Set up abort controller BEFORE flushing headers
  // Express 5 can fire 'close' during flushHeaders in some cases
  const abortController = new AbortController()
  const abortTimeout = setTimeout(() => abortController.abort(), 120_000)
  req.on('close', () => {
    clearTimeout(abortTimeout)
    abortController.abort()
  })

  // ─── Usage gate (free tier enforcement) ────────────────────────────────────
  const userId = (body as unknown as Record<string, unknown>).userId as string | undefined
  const isPro = (body as unknown as Record<string, unknown>).isPro === true
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

  // Use a separate signal for the LLM call — only timeout-based, not tied to req close
  // This prevents premature abort when Express fires 'close' during SSE setup
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

    // Record usage for free-tier tracking (only after successful LLM response)
    if (result.source === 'llm') {
      recordUsage(userId)
    }

    if (!res.writableEnded) {
      sendSseComplete(res, result)
    }
  } catch (err) {
    if (!res.writableEnded) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      sendSseComplete(res, {
        message: `${intent.message || 'Something went wrong.'}\n\n(${message})`,
        actions: llmOnly ? [] : intent.actions,
        source: 'fallback',
      })
    }
  }
})

// ─── Classic JSON endpoint (non-streaming, kept for compatibility) ────────────

app.post('/api/chat', async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const mode = classifyMode(userMessage)
  const userIntent = parseUserIntent(userMessage)
  const intent = resolveIntent(userMessage)
  const llmOnly = isLlmOnlyMode(mode) || body.forceLlm

  if (mode === 'help' && !body.forceLlm) {
    res.json({ message: intent.message, actions: [], source: 'template' })
    return
  }

  if (!llmOnly && (intent.actions.length > 0 || intent.message.length > 0)) {
    res.json({
      message: intent.message,
      actions: intent.actions,
      source: intent.actions.length > 0 ? 'template' : 'fallback',
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
    res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.json({
      message: `${intent.message || 'Something went wrong.'}\n\n(${message})`,
      actions: llmOnly ? [] : intent.actions,
      source: 'fallback',
    })
  }
})

// ─── Usage check endpoint ────────────────────────────────────────────────────

app.post('/api/usage', (req, res) => {
  const { userId, isPro } = req.body as { userId?: string; isPro?: boolean }
  const stats = getUsageStats(userId, isPro === true)
  res.json(stats)
})

// ─── Stripe Checkout ─────────────────────────────────────────────────────────

app.post('/api/checkout', async (req, res) => {
  // Only trust userId and email from client — price is always server-controlled
  const { userId, email } = req.body as { userId?: string; email?: string }

  if (!userId || !email) {
    res.status(400).json({ error: 'userId and email are required' })
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

// ─── Stripe Webhook ──────────────────────────────────────────────────────────

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const { verifyWebhookSignature, handleStripeWebhook } = await import('./stripe.js')
    const signatureHeader = req.headers['stripe-signature'] as string | undefined

    // Verify signature — rejects spoofed or replayed webhooks
    const event = verifyWebhookSignature(req.body, signatureHeader)
    const result = handleStripeWebhook(event)

    if (result) {
      // In production, update Clerk user metadata here via Clerk Backend API
      console.log(`Stripe webhook: user ${result.userId} -> plan ${result.plan}`)
    }

    res.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    console.error('Stripe webhook error:', message)
    res.status(400).json({ error: message })
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
})

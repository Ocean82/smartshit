import fs from 'node:fs'
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { chatWithOllama, chatWithOllamaStream, modelIsRegistered, ollamaReachable } from './ollama.js'
import { groqAvailable, chatWithGroqStream } from './groq.js'
import { chatWithOpenAiCompatible, chatWithOpenAiCompatibleStream, openAiCompatibleAvailable } from './openaiCompatible.js'
import { buildSystemPrompt, type ChatRequestBody, type ChatResponseBody } from './prompt.js'
import { parseAgentResponse } from './parseResponse.js'
import { resolveIntent, isWeakResponse } from './intent.js'

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

  const intent = resolveIntent(userMessage)

  // Fast path — instant template response
  if (!body.forceLlm && (intent.actions.length > 0 || intent.message.length > 0)) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const payload: ChatResponseBody = {
      message: intent.message,
      actions: intent.actions,
      source: 'template',
    }
    res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
    res.end()
    return
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const abortController = new AbortController()
  req.on('close', () => abortController.abort())

  const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(body.context) },
    ...history.slice(-4),
    { role: 'user' as const, content: userMessage },
  ]

  const availableProviders = providerOrder().filter(providerIsConfigured)
  const providerErrors: string[] = []

  try {
    let fullText = ''
    let usedProvider: ProviderName | null = null

    for (const provider of availableProviders) {
      try {
        fullText = await callProviderStream(
          provider,
          messages,
          (chunk) => {
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`)
            }
          },
          abortController.signal,
        )
        usedProvider = provider
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        providerErrors.push(`${provider}: ${message}`)
      }
    }

    if (!usedProvider) {
      const payload: ChatResponseBody = {
        message:
          intent.message ||
          'AI is currently unavailable. Configure OPENROUTER_API_KEY, HUGGINGFACE_API_KEY, GROQ_API_KEY, or a local Ollama model.',
        actions: intent.actions,
        source: 'fallback',
      }
      res.write(`data: ${JSON.stringify({ type: 'complete', ...payload, errors: providerErrors })}\n\n`)
      res.end()
      return
    }

    // Parse the final accumulated text into structured response
    let parsed = parseAgentResponse(fullText)

    if (isWeakResponse(parsed.message, parsed.actions)) {
      parsed = {
        message: intent.message || fullText || 'Try a specific request like "build a monthly budget".',
        actions: intent.actions,
      }
    }

    if (!res.writableEnded) {
      const payload: ChatResponseBody = {
        message: parsed.message,
        actions: parsed.actions,
        source: 'llm',
      }
      res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
      res.end()
    }
  } catch (err) {
    if (!res.writableEnded) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const payload: ChatResponseBody = {
        message: `${intent.message || 'Something went wrong.'}\n\n(${message})`,
        actions: intent.actions,
        source: 'fallback',
      }
      res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
      res.end()
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

  const intent = resolveIntent(userMessage)

  if (!body.forceLlm && (intent.actions.length > 0 || intent.message.length > 0)) {
    const payload: ChatResponseBody = {
      message: intent.message,
      actions: intent.actions,
      source: intent.actions.length > 0 ? 'template' : 'fallback',
    }
    res.json(payload)
    return
  }

  // Try configured providers in order with graceful fallback
  try {
    const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(body.context) },
      ...history.slice(-4),
      { role: 'user' as const, content: userMessage },
    ]

    const availableProviders = providerOrder().filter(providerIsConfigured)
    let raw = ''
    let usedProvider: ProviderName | null = null

    for (const provider of availableProviders) {
      try {
        raw = await callProvider(provider, messages)
        usedProvider = provider
        break
      } catch {
        // keep trying the next provider
      }
    }

    if (!usedProvider) {
      const payload: ChatResponseBody = {
        message:
          intent.message ||
          'AI is currently unavailable. Configure OPENROUTER_API_KEY, HUGGINGFACE_API_KEY, GROQ_API_KEY, or a local Ollama model.',
        actions: intent.actions,
        source: 'fallback',
      }
      res.status(200).json(payload)
      return
    }

    let parsed = parseAgentResponse(raw)
    if (isWeakResponse(parsed.message, parsed.actions)) {
      parsed = { message: intent.message || 'Try a specific request.', actions: intent.actions }
    }

    const payload: ChatResponseBody = { message: parsed.message, actions: parsed.actions, source: 'llm' }
    res.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const payload: ChatResponseBody = {
      message: `${intent.message || 'Something went wrong.'}\n\n(${message})`,
      actions: intent.actions,
      source: 'fallback',
    }
    res.status(200).json(payload)
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
})

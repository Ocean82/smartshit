import fs from 'node:fs'
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { chatWithOllama, chatWithOllamaStream, modelIsRegistered, ollamaReachable } from './ollama.js'
import { groqAvailable, chatWithGroqStream } from './groq.js'
import { buildSystemPrompt, type ChatRequestBody, type ChatResponseBody } from './prompt.js'
import { parseAgentResponse } from './parseResponse.js'
import { resolveIntent, isWeakResponse } from './intent.js'

const app = express()
app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: '1mb' }))

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false
  const groq = groqAvailable()

  res.json({
    ok: groq || (ollama && modelReady),
    service: 'smartshit-server',
    groq,
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

  // Try Groq first (fast cloud), fall back to Ollama (local)
  const useGroq = groqAvailable()

  try {
    let fullText: string

    if (useGroq) {
      fullText = await chatWithGroqStream(
        messages,
        (chunk) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`)
          }
        },
        abortController.signal,
      )
    } else {
      // Check Ollama availability
      const ollama = await ollamaReachable()
      const modelReady = ollama ? await modelIsRegistered() : false

      if (!ollama || !modelReady) {
        const payload: ChatResponseBody = {
          message: intent.message || 'AI is not available. Set GROQ_API_KEY or start Ollama.',
          actions: intent.actions,
          source: 'fallback',
        }
        res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
        res.end()
        return
      }

      fullText = await chatWithOllamaStream(
        messages,
        (chunk) => {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`)
          }
        },
        abortController.signal,
      )
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
        source: useGroq ? 'llm' : 'llm',
      }
      res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
      res.end()
    }
  } catch (err) {
    // If Groq fails, try Ollama as fallback
    if (useGroq && !res.writableEnded) {
      try {
        const ollama = await ollamaReachable()
        if (ollama) {
          const fullText = await chatWithOllamaStream(
            messages,
            (chunk) => {
              if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`)
              }
            },
            abortController.signal,
          )
          const parsed = parseAgentResponse(fullText)
          const payload: ChatResponseBody = { message: parsed.message, actions: parsed.actions, source: 'llm' }
          res.write(`data: ${JSON.stringify({ type: 'complete', ...payload })}\n\n`)
          res.end()
          return
        }
      } catch {
        // Both failed
      }
    }

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

  // Try Groq, fallback Ollama
  try {
    const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(body.context) },
      ...history.slice(-4),
      { role: 'user' as const, content: userMessage },
    ]

    let raw: string
    if (groqAvailable()) {
      const { chatWithGroq } = await import('./groq.js')
      raw = await chatWithGroq(messages)
    } else {
      raw = await chatWithOllama(messages)
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
  console.log(`Groq: ${groqAvailable() ? `✓ (${config.groqModel})` : '✗ (no API key)'}`)
  console.log(`Ollama: ${config.ollamaBaseUrl} (model: ${config.modelName})`)
})

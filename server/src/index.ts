import fs from 'node:fs'
import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { chatWithOllama, modelIsRegistered, ollamaReachable } from './ollama.js'
import { buildSystemPrompt, type ChatRequestBody, type ChatResponseBody } from './prompt.js'
import { parseAgentResponse } from './parseResponse.js'
import { resolveIntent, isWeakResponse } from './intent.js'

const app = express()
app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: '1mb' }))

app.get('/health', async (_req, res) => {
  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false
  const modelFileExists = fs.existsSync(config.modelPath)

  res.json({
    ok: ollama && modelReady,
    service: 'smartshit-server',
    ollama,
    modelRegistered: modelReady,
    modelName: config.modelName,
    modelFileExists,
    modelPath: config.modelPath,
    port: config.port,
  })
})

app.post('/api/chat', async (req, res) => {
  const body = req.body as ChatRequestBody
  const userMessage = body.message?.trim()

  if (!userMessage) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const intent = resolveIntent(userMessage)

  // Reliable instant path — keyword intent with actions or helpful replies
  if (!body.forceLlm && (intent.actions.length > 0 || intent.message.length > 0)) {
    const payload: ChatResponseBody = {
      message: intent.message,
      actions: intent.actions,
      source: intent.actions.length > 0 ? 'template' : 'fallback',
    }
    res.json(payload)
    return
  }

  const ollama = await ollamaReachable()
  const modelReady = ollama ? await modelIsRegistered() : false

  if (!ollama || !modelReady) {
    const payload: ChatResponseBody = {
      message: intent.message || 'AI server is offline. Start the server with npm run dev:server and run npm run model:setup.',
      actions: intent.actions,
      source: 'fallback',
    }
    res.json(payload)
    return
  }

  try {
    const history = (body.history ?? []).filter((m) => m.role === 'user' || m.role === 'assistant')
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(body.context) },
      ...history,
      { role: 'user' as const, content: userMessage },
    ]

    const raw = await chatWithOllama(messages)
    let parsed = parseAgentResponse(raw)

    if (isWeakResponse(parsed.message, parsed.actions)) {
      parsed = {
        message: intent.message || 'I could not generate a detailed answer from the local model. Try a specific request like "build a monthly budget".',
        actions: intent.actions,
      }
    }

    const payload: ChatResponseBody = {
      message: parsed.message,
      actions: parsed.actions,
      source: 'llm',
    }
    res.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const payload: ChatResponseBody = {
      message: `${intent.message || 'Something went wrong with the local model.'}\n\n(${message})`,
      actions: intent.actions,
      source: 'fallback',
    }
    res.status(200).json(payload)
  }
})

app.listen(config.port, config.host, () => {
  console.log(`smartsh!t server listening on http://${config.host}:${config.port}`)
  console.log(`Model: ${config.modelName} | Ollama: ${config.ollamaBaseUrl}`)
})

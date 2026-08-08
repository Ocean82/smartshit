/**
 * LLM provider utilities — extracted to avoid circular dependencies.
 * Both index.ts and llmIntentParser.ts import from here.
 *
 * Refactored to:
 * - Pass jsonMode to ALL providers (not just Groq)
 * - Include provider identity metadata in responses
 * - Support configurable maxTokens for act/tool calls
 * - Properly cascade failover with logging
 */
import { config } from './config.js'
import { chatWithOllama, chatWithOllamaStream } from './ollama.js'
import { groqAvailable, chatWithGroqStream, recordGroqFallback } from './groq.js'
import { chatWithOpenAiCompatible, chatWithOpenAiCompatibleStream, openAiCompatibleAvailable } from './openaiCompatible.js'

export type ProviderName = 'openrouter' | 'huggingface' | 'groq' | 'ollama'

/** Canonical list of supported LLM provider identifiers. */
export const ALLOWED_PROVIDERS: readonly ProviderName[] = ['openrouter', 'huggingface', 'groq', 'ollama'] as const

export function providerOrder(): ProviderName[] {
  return config.llmProviderOrder.filter((provider): provider is ProviderName =>
    ALLOWED_PROVIDERS.includes(provider as ProviderName),
  )
}

export function providerIsConfigured(provider: ProviderName): boolean {
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

export interface ProviderCallOptions {
  /** Enable JSON mode for structured output (action mode). */
  jsonMode?: boolean
  /** Override max_tokens. Default: 1280 for Groq, 768 for others. Use 2048+ for act/tool calls. */
  maxTokens?: number
}

/** Metadata about which provider/model handled the request. */
export interface ProviderMeta {
  provider: ProviderName
  model: string
  latencyMs: number
}

/** Response from a provider call including the text and metadata. */
export interface ProviderResponse {
  text: string
  meta: ProviderMeta
}

/** Resolve the model name for a given provider. */
export function getModelName(provider: ProviderName): string {
  switch (provider) {
    case 'groq': return config.groqModel
    case 'openrouter': return config.openRouterModel
    case 'huggingface': return config.huggingFaceModel
    case 'ollama': return config.modelName
  }
}

export async function callProviderStream(
  provider: ProviderName,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const start = performance.now()
  let text: string

  if (provider === 'openrouter') {
    text = await chatWithOpenAiCompatibleStream(
      {
        apiKey: config.openRouterApiKey,
        model: config.openRouterModel,
        baseUrl: config.openRouterBaseUrl,
      },
      messages,
      onChunk,
      signal,
      { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
    )
  } else if (provider === 'huggingface') {
    text = await chatWithOpenAiCompatibleStream(
      {
        apiKey: config.huggingFaceApiKey,
        model: config.huggingFaceModel,
        baseUrl: config.huggingFaceBaseUrl,
      },
      messages,
      onChunk,
      signal,
      { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
    )
  } else if (provider === 'groq') {
    text = await chatWithGroqStream(messages, onChunk, signal, {
      jsonMode: options.jsonMode,
      maxTokens: options.maxTokens,
    })
  } else {
    text = await chatWithOllamaStream(messages, onChunk, signal, {
      jsonMode: options.jsonMode,
    })
  }

  return {
    text,
    meta: {
      provider,
      model: getModelName(provider),
      latencyMs: Math.round(performance.now() - start),
    },
  }
}

export async function callProvider(
  provider: ProviderName,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const start = performance.now()
  let text: string

  if (provider === 'openrouter') {
    text = await chatWithOpenAiCompatible(
      {
        apiKey: config.openRouterApiKey,
        model: config.openRouterModel,
        baseUrl: config.openRouterBaseUrl,
      },
      messages,
      { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
    )
  } else if (provider === 'huggingface') {
    text = await chatWithOpenAiCompatible(
      {
        apiKey: config.huggingFaceApiKey,
        model: config.huggingFaceModel,
        baseUrl: config.huggingFaceBaseUrl,
      },
      messages,
      { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
    )
  } else if (provider === 'groq') {
    const { chatWithGroq } = await import('./groq.js')
    text = await chatWithGroq(messages, {
      jsonMode: options.jsonMode,
      maxTokens: options.maxTokens,
    })
  } else {
    // Primary Ollama model — use JSON format when structured output is needed.
    text = await chatWithOllama(messages, { jsonMode: options.jsonMode })
  }

  return {
    text,
    meta: {
      provider,
      model: getModelName(provider),
      latencyMs: Math.round(performance.now() - start),
    },
  }
}

/**
 * Call providers in failover order, returning the first successful response.
 * Throws if all providers fail (fail-closed behavior).
 */
export async function callProviderWithFailover(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const providers = providerOrder().filter(providerIsConfigured)

  if (providers.length === 0) {
    throw new Error('No AI providers configured or available')
  }

  let lastError: Error | null = null

  for (const provider of providers) {
    try {
      const response = await callProvider(provider, messages, options)
      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.warn(`[providers] ${provider} failed, trying next:`, lastError.message)

      if (provider === 'groq') {
        recordGroqFallback()
      }
    }
  }

  // All providers exhausted — fail closed
  throw new Error(
    `All AI providers failed. Last error: ${lastError?.message ?? 'unknown'}. ` +
    `Tried: ${providers.join(', ')}.`
  )
}

export { recordGroqFallback }

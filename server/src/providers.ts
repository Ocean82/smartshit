/**
 * LLM provider utilities — extracted to avoid circular dependencies.
 * Both index.ts and llmIntentParser.ts import from here.
 */
import { config } from './config.js'
import { chatWithOllama, chatWithOllamaStream } from './ollama.js'
import { groqAvailable, chatWithGroqStream } from './groq.js'
import { chatWithOpenAiCompatible, chatWithOpenAiCompatibleStream, openAiCompatibleAvailable } from './openaiCompatible.js'

export type ProviderName = 'openrouter' | 'huggingface' | 'groq' | 'ollama'

export function providerOrder(): ProviderName[] {
  const allowed: ProviderName[] = ['openrouter', 'huggingface', 'groq', 'ollama']
  return config.llmProviderOrder.filter((provider): provider is ProviderName =>
    allowed.includes(provider as ProviderName),
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

export async function callProviderStream(
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

  return chatWithOllamaStream(messages, onChunk, signal)
}

export async function callProvider(
  provider: ProviderName,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string> {
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

/**
 * Bring Your Own Key (BYOK) — Users can provide their own API key
 * for cloud LLM providers. This costs the app owner nothing; usage
 * is charged to the user's own account.
 *
 * Supported providers (all OpenAI-compatible):
 * - OpenRouter (recommended — access to 100+ models)
 * - Groq (fast, free tier available)
 * - OpenAI
 * - Any OpenAI-compatible endpoint
 */

const STORAGE_KEY = 'smartsht-user-api-key'

export type ByokProvider = 'openrouter' | 'groq' | 'openai' | 'custom'

export interface UserApiKeyConfig {
  provider: ByokProvider
  apiKey: string
  model?: string
  baseUrl?: string
}

const PROVIDER_DEFAULTS: Record<ByokProvider, { baseUrl: string; model: string; label: string }> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen3-30b-a3b',
    label: 'OpenRouter',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    label: 'Groq',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI',
  },
  custom: {
    baseUrl: '',
    model: '',
    label: 'Custom Endpoint',
  },
}

export function getProviderDefaults(provider: ByokProvider) {
  return PROVIDER_DEFAULTS[provider]
}

export function getProviderLabel(provider: ByokProvider): string {
  return PROVIDER_DEFAULTS[provider].label
}

export function getAllProviders(): Array<{ value: ByokProvider; label: string }> {
  return [
    { value: 'openrouter', label: 'OpenRouter (100+ models)' },
    { value: 'groq', label: 'Groq (fast, free tier)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'custom', label: 'Custom Endpoint' },
  ]
}

export function loadUserApiKey(): UserApiKeyConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserApiKeyConfig
    if (!parsed.apiKey || !parsed.provider) return null
    return parsed
  } catch {
    return null
  }
}

export function saveUserApiKey(config: UserApiKeyConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Storage unavailable
  }
}

export function clearUserApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Build the BYOK payload to send with chat requests.
 * Returns null if no user key is configured.
 */
export function getByokPayload(): {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
} | null {
  const config = loadUserApiKey()
  if (!config?.apiKey) return null

  const defaults = PROVIDER_DEFAULTS[config.provider]
  return {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model || defaults.model,
    baseUrl: config.baseUrl || defaults.baseUrl,
  }
}

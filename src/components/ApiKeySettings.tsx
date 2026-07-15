import { useState, useEffect } from 'react'
import { Key, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import {
  loadUserApiKey,
  saveUserApiKey,
  clearUserApiKey,
  getAllProviders,
  getProviderDefaults,
  type ByokProvider,
  type UserApiKeyConfig,
} from '@/lib/userApiKey'

export function ApiKeySettings() {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<UserApiKeyConfig | null>(loadUserApiKey)
  const [provider, setProvider] = useState<ByokProvider>(config?.provider ?? 'openrouter')
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '')
  const [model, setModel] = useState(config?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!config) {
      const defaults = getProviderDefaults(provider)
      setModel(defaults.model)
      setBaseUrl(defaults.baseUrl)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleProviderChange(p: ByokProvider) {
    setProvider(p)
    const defaults = getProviderDefaults(p)
    setModel(defaults.model)
    setBaseUrl(defaults.baseUrl)
  }

  function handleSave() {
    if (!apiKey.trim()) return
    const newConfig: UserApiKeyConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    }
    saveUserApiKey(newConfig)
    setConfig(newConfig)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClear() {
    clearUserApiKey()
    setConfig(null)
    setApiKey('')
    setModel(getProviderDefaults('openrouter').model)
    setBaseUrl(getProviderDefaults('openrouter').baseUrl)
    setProvider('openrouter')
  }

  const hasKey = Boolean(config?.apiKey)

  return (
    <div className="border-t border-gray-100">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Key size={11} className={hasKey ? 'text-emerald-500' : 'text-gray-400'} />
          {hasKey ? `Using your ${config!.provider} key` : 'Bring your own API key'}
        </span>
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-gray-400 leading-tight">
            Use your own API key for faster, unlimited AI responses. Usage is billed to your account — free for the app.
          </p>

          {/* Provider select */}
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as ByokProvider)}
            className="w-full text-[11px] px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:border-blue-400 outline-none"
          >
            {getAllProviders().map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {/* API Key */}
          <input
            type="password"
            placeholder="Paste your API key..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full text-[11px] px-2 py-1.5 border border-gray-200 rounded-lg focus:border-blue-400 outline-none font-mono"
          />

          {/* Model (optional override) */}
          <input
            type="text"
            placeholder="Model (optional)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full text-[11px] px-2 py-1.5 border border-gray-200 rounded-lg focus:border-blue-400 outline-none"
          />

          {/* Custom base URL (only shown for custom provider) */}
          {provider === 'custom' && (
            <input
              type="text"
              placeholder="Base URL (e.g. https://api.example.com/v1)"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full text-[11px] px-2 py-1.5 border border-gray-200 rounded-lg focus:border-blue-400 outline-none"
            />
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saved ? <Check size={11} /> : <Key size={11} />}
              {saved ? 'Saved' : 'Save Key'}
            </button>
            {hasKey && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
              >
                <X size={11} /> Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Token Budget Calculator — Provider-aware context window allocation.
 *
 * Determines how much of the available context window can be allocated to
 * spreadsheet data, conversation history, and generation based on the
 * target LLM provider's capacity.
 *
 * Token estimation uses a fast heuristic (chars / 3.5) rather than a full
 * tokenizer — accurate within ~10% for English-heavy content, which is
 * sufficient for budget allocation decisions.
 */

import { config } from './config.js'

// ─── Provider Context Windows ────────────────────────────────────────────────

export type ProviderName = 'ollama' | 'groq' | 'openrouter' | 'huggingface'

/** Maximum context window (input + output tokens) per provider. */
const PROVIDER_CONTEXT_WINDOWS: Record<ProviderName, number> = {
  ollama: config.numCtx,
  groq: 128_000,
  openrouter: 32_000,
  huggingface: 32_000,
}

/** Default max output tokens per provider. */
const PROVIDER_MAX_OUTPUT: Record<ProviderName, number> = {
  ollama: config.numPredict,
  groq: 2048,
  openrouter: 2048,
  huggingface: 2048,
}

/**
 * Practical input budget ceiling for cloud providers.
 * We don't need to fill a 128K window — diminishing returns past ~16K input
 * tokens, and larger payloads increase latency and cost.
 */
const CLOUD_INPUT_CAP = 16_000

// ─── Token Estimation ────────────────────────────────────────────────────────

/**
 * Fast token estimate from text length.
 *
 * For Qwen/Llama-family tokenizers on English + structured data (JSON, cell
 * refs, numbers), average token is ~3.5 characters. This heuristic avoids
 * importing a full tokenizer while staying accurate enough for budget decisions.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.5)
}

/**
 * Estimate token count for an array of chat messages.
 * Adds ~4 tokens per message for role/formatting overhead.
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  let total = 0
  for (const msg of messages) {
    total += estimateTokens(msg.content) + 4 // role + delimiters
  }
  return total
}

// ─── Budget Allocation ───────────────────────────────────────────────────────

export interface TokenBudget {
  /** Provider's total context window (input + output) */
  totalWindow: number
  /** Tokens reserved for model output/generation */
  generation: number
  /** Tokens consumed by system prompt */
  systemPrompt: number
  /** Tokens allocated for conversation history */
  history: number
  /** Tokens available for spreadsheet context (the key number) */
  context: number
  /** Tokens reserved for the current user message */
  userMessage: number
  /** Provider being targeted */
  provider: ProviderName
  /** Whether the budget is constrained (Ollama) vs generous (cloud) */
  isConstrained: boolean
}

export interface BudgetInput {
  provider: ProviderName
  systemPromptText: string
  historyMessages?: Array<{ role: string; content: string }>
  userMessageText?: string
}

/**
 * Allocate token budget across prompt components based on target provider.
 *
 * Priority order (what gets space first):
 * 1. Generation reserve (output)
 * 2. System prompt (measured — non-negotiable)
 * 3. User message (measured or estimated)
 * 4. History (up to maxHistory messages or remaining budget)
 * 5. Context (whatever remains — this is what we maximize)
 */
export function allocateBudget(input: BudgetInput): TokenBudget {
  const { provider, systemPromptText, historyMessages = [], userMessageText = '' } = input

  const totalWindow = PROVIDER_CONTEXT_WINDOWS[provider]
  const generation = PROVIDER_MAX_OUTPUT[provider]
  const isConstrained = provider === 'ollama'

  // Measure fixed costs
  const systemPromptTokens = estimateTokens(systemPromptText)
  const userMessageTokens = Math.max(estimateTokens(userMessageText), 150) // min 150 reserve

  // Available for history + context
  const available = (isConstrained ? totalWindow : Math.min(totalWindow, CLOUD_INPUT_CAP + generation))
    - generation
    - systemPromptTokens
    - userMessageTokens

  if (available <= 0) {
    // Pathological case: system prompt alone exceeds budget
    return {
      totalWindow,
      generation,
      systemPrompt: systemPromptTokens,
      history: 0,
      context: 0,
      userMessage: userMessageTokens,
      provider,
      isConstrained,
    }
  }

  // Allocate history: measure actual history or cap at 40% of remaining
  const historyTokens = historyMessages.length > 0
    ? Math.min(estimateMessagesTokens(historyMessages), Math.floor(available * 0.4))
    : 0

  // Context gets everything that's left
  const contextTokens = Math.max(0, available - historyTokens)

  return {
    totalWindow,
    generation,
    systemPrompt: systemPromptTokens,
    history: historyTokens,
    context: contextTokens,
    userMessage: userMessageTokens,
    provider,
    isConstrained,
  }
}

/**
 * Quick check: can the assembled prompt fit in the provider's window?
 * Returns the overflow amount (0 = fits, positive = over budget).
 */
export function checkOverflow(
  provider: ProviderName,
  assembledMessages: Array<{ role: string; content: string }>,
): number {
  const totalWindow = PROVIDER_CONTEXT_WINDOWS[provider]
  const generation = PROVIDER_MAX_OUTPUT[provider]
  const inputTokens = estimateMessagesTokens(assembledMessages)
  const overflow = (inputTokens + generation) - totalWindow
  return Math.max(0, overflow)
}

/**
 * Determine the maximum number of history messages that fit within budget.
 */
export function maxHistoryForBudget(
  provider: ProviderName,
  systemPromptTokens: number,
  contextTokens: number,
  userMessageTokens: number,
  historyMessages: Array<{ role: string; content: string }>,
): number {
  const totalWindow = PROVIDER_CONTEXT_WINDOWS[provider]
  const generation = PROVIDER_MAX_OUTPUT[provider]
  const fixedCost = generation + systemPromptTokens + contextTokens + userMessageTokens
  const budgetForHistory = totalWindow - fixedCost

  if (budgetForHistory <= 0) return 0

  // Walk backwards through history, accumulating token cost
  let accumulated = 0
  let count = 0
  for (let i = historyMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(historyMessages[i].content) + 4
    if (accumulated + msgTokens > budgetForHistory) break
    accumulated += msgTokens
    count++
  }

  return count
}

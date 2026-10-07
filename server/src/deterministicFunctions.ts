import { forecast } from './forecast.js'
import { score } from './scoring.js'

export type DeterministicOutcome =
  | { ok: true; result: string | number | null; method: string; confidence?: number }
  | { ok: false; error: string }

/**
 * AI.PREDICT and AI.SCORE use local math, never the LLM. Returns null for
 * every other function so callers fall through to the model.
 */
export function runDeterministicFunction(
  funcName: string,
  args: Record<string, unknown>,
): DeterministicOutcome | null {
  const name = funcName.toUpperCase()

  if (name === 'AI.PREDICT') {
    const values = args.values
    if (!Array.isArray(values) || values.length === 0) {
      return { ok: false, error: 'AI.PREDICT requires a non-empty "values" array of numbers' }
    }
    const numericValues = (values as unknown[]).map(Number).filter((v) => !isNaN(v))
    if (numericValues.length === 0) return { ok: false, error: 'AI.PREDICT requires numeric values' }
    const periods = typeof args.periods === 'number' ? args.periods : 1
    const method = typeof args.method === 'string' ? args.method as 'linear' | 'moving_average' | 'seasonal_naive' : undefined
    const result = forecast(numericValues, { periods, method })
    return { ok: true, result: result.value, method: result.method, confidence: result.confidence }
  }

  if (name === 'AI.SCORE') {
    const input = args.input ?? args.value ?? args.text ?? ''
    const criteria = typeof args.criteria === 'string' ? args.criteria : 'quality'
    const distribution = Array.isArray(args.distribution)
      ? (args.distribution as unknown[]).map(Number).filter((v) => !isNaN(v))
      : undefined
    const mean = typeof args.mean === 'number' ? args.mean : undefined
    const stddev = typeof args.stddev === 'number' ? args.stddev : undefined
    const value = typeof input === 'number' ? input : String(input)
    const result = score(value, { criteria, distribution, mean, stddev })
    return { ok: true, result: result.score, method: result.method }
  }

  return null
}

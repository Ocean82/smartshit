/**
 * Label Validation — ensures AI.CATEGORIZE / AI.CLASSIFY responses
 * match the provided allowlist.
 *
 * When the LLM returns a label not in the allowlist:
 * 1. Try case-insensitive exact match
 * 2. Try Levenshtein distance ≤ 2 (fuzzy match)
 * 3. Try substring containment
 * 4. Return original with a warning if no match found
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LabelValidationResult {
  /** The validated (possibly corrected) label */
  label: string
  /** Whether the label was modified from the LLM output */
  corrected: boolean
  /** Warning if label could not be matched to allowlist */
  warning?: string
  /** The original LLM output before correction */
  original?: string
}

export interface SentimentResult {
  /** The sentiment label */
  label: 'positive' | 'negative' | 'neutral'
  /** Confidence score 0-1 (parsed from LLM response or default 0.8) */
  confidence: number
}

// ─── Label Validation ────────────────────────────────────────────────────────

/**
 * Validate a label against an allowlist of categories.
 * Returns the closest valid match or the original with a warning.
 */
export function validateLabel(rawLabel: string, allowlist: string[]): LabelValidationResult {
  const trimmed = rawLabel.trim()

  if (allowlist.length === 0) {
    return { label: trimmed, corrected: false }
  }

  // 1. Exact match (case-insensitive)
  const exactMatch = allowlist.find((a) => a.toLowerCase() === trimmed.toLowerCase())
  if (exactMatch) {
    return { label: exactMatch, corrected: exactMatch !== trimmed, original: exactMatch !== trimmed ? trimmed : undefined }
  }

  // 2. Levenshtein distance ≤ 2
  let bestDistance = Infinity
  let bestMatch = ''
  for (const candidate of allowlist) {
    const dist = levenshtein(trimmed.toLowerCase(), candidate.toLowerCase())
    if (dist < bestDistance) {
      bestDistance = dist
      bestMatch = candidate
    }
  }
  if (bestDistance <= 2) {
    return { label: bestMatch, corrected: true, original: trimmed }
  }

  // 3. Substring containment (either direction)
  const lowerTrimmed = trimmed.toLowerCase()
  const substringMatch = allowlist.find((a) =>
    a.toLowerCase().includes(lowerTrimmed) || lowerTrimmed.includes(a.toLowerCase())
  )
  if (substringMatch) {
    return { label: substringMatch, corrected: true, original: trimmed }
  }

  // 4. No match — return original with warning
  return {
    label: trimmed,
    corrected: false,
    warning: `Label "${trimmed}" is not in the allowlist: [${allowlist.join(', ')}]`,
  }
}

/**
 * Parse categories string into an array.
 * Handles comma-separated, pipe-separated, and newline-separated formats.
 */
export function parseAllowlist(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  const str = String(raw)
  // Split on commas, pipes, or newlines
  return str.split(/[,|\n]/).map((s) => s.trim()).filter(Boolean)
}

// ─── Sentiment Parsing ───────────────────────────────────────────────────────

/**
 * Parse a sentiment response from the LLM.
 * Handles various formats:
 * - "positive" (plain label)
 * - "positive|0.85" (label with confidence)
 * - "positive (confidence: 0.9)" (verbose format)
 */
export function parseSentiment(raw: string): SentimentResult {
  const trimmed = raw.trim().toLowerCase()

  // Try "label|confidence" format
  const pipeMatch = trimmed.match(/^(positive|negative|neutral)\s*[|:]\s*(\d*\.?\d+)/)
  if (pipeMatch) {
    return {
      label: pipeMatch[1] as SentimentResult['label'],
      confidence: Math.min(1, Math.max(0, parseFloat(pipeMatch[2]))),
    }
  }

  // Try "(confidence: N)" format
  const parenMatch = trimmed.match(/(positive|negative|neutral).*?(\d*\.?\d+)/)
  if (parenMatch) {
    const conf = parseFloat(parenMatch[2])
    // Only use as confidence if it looks like a 0-1 value
    if (conf > 0 && conf <= 1) {
      return { label: parenMatch[1] as SentimentResult['label'], confidence: conf }
    }
  }

  // Plain label
  if (trimmed.startsWith('positive')) return { label: 'positive', confidence: 0.8 }
  if (trimmed.startsWith('negative')) return { label: 'negative', confidence: 0.8 }
  if (trimmed.startsWith('neutral')) return { label: 'neutral', confidence: 0.8 }

  // Fallback — couldn't parse reliably
  return { label: 'neutral', confidence: 0.5 }
}

// ─── Levenshtein Distance ────────────────────────────────────────────────────

/**
 * Compute Levenshtein edit distance between two strings.
 * Optimized with single-row DP for memory efficiency.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Use shorter string as the "column" for memory efficiency
  if (a.length > b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  const aLen = a.length
  const bLen = b.length

  // Single row DP
  const row = new Array<number>(aLen + 1)
  for (let i = 0; i <= aLen; i++) row[i] = i

  for (let j = 1; j <= bLen; j++) {
    let prev = row[0]
    row[0] = j
    for (let i = 1; i <= aLen; i++) {
      const curr = row[i]
      if (a[i - 1] === b[j - 1]) {
        row[i] = prev
      } else {
        row[i] = 1 + Math.min(prev, row[i], row[i - 1])
      }
      prev = curr
    }
  }

  return row[aLen]
}

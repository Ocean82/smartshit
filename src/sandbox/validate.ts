/**
 * Sandbox Execution Engine — Script Validation
 *
 * Pre-execution validation to reject obviously dangerous or malformed scripts
 * before they even reach the QuickJS VM.
 */

/** Patterns that should never appear in agent-generated spreadsheet scripts. */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\beval\s*\(/, reason: 'eval() is not allowed' },
  { pattern: /\bnew\s+Function\s*\(/, reason: 'new Function() is not allowed' },
  { pattern: /\bimport\s*\(/, reason: 'Dynamic imports are not available' },
  { pattern: /\brequire\s*\(/, reason: 'require() is not available' },
  { pattern: /\bprocess\b/, reason: 'process is not available in the sandbox' },
  { pattern: /\b__proto__\b/, reason: '__proto__ access is not allowed' },
  { pattern: /\bconstructor\s*\[/, reason: 'Constructor access is not allowed' },
  { pattern: /\bObject\.defineProperty\b/, reason: 'Object.defineProperty is not allowed' },
  { pattern: /\bObject\.setPrototypeOf\b/, reason: 'Prototype manipulation is not allowed' },
  { pattern: /\bReflect\b/, reason: 'Reflect is not available' },
  { pattern: /\bProxy\b/, reason: 'Proxy is not available' },
  { pattern: /\bglobalThis\b/, reason: 'globalThis access is not allowed' },
  { pattern: /\bwindow\b/, reason: 'window is not available in the sandbox' },
  { pattern: /\bdocument\b/, reason: 'document is not available in the sandbox' },
  { pattern: /\bfetch\b/, reason: 'Network access is not available' },
  { pattern: /\bXMLHttpRequest\b/, reason: 'Network access is not available' },
  { pattern: /\bWebSocket\b/, reason: 'Network access is not available' },
  { pattern: /\bsetTimeout\b/, reason: 'setTimeout is not available (use synchronous code)' },
  { pattern: /\bsetInterval\b/, reason: 'setInterval is not available (use synchronous code)' },
]

/** Maximum script length in characters. */
const MAX_SCRIPT_LENGTH = 10_000

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate a script before execution.
 * Returns { valid: true } if the script passes all checks, or
 * { valid: false, error: "..." } with a user-friendly explanation.
 */
export function validateScript(code: string): ValidationResult {
  if (!code || !code.trim()) {
    return { valid: false, error: 'Script is empty' }
  }

  if (code.length > MAX_SCRIPT_LENGTH) {
    return {
      valid: false,
      error: `Script is too long (${code.length} chars, max ${MAX_SCRIPT_LENGTH}). Simplify the logic or operate on a smaller range.`,
    }
  }

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return { valid: false, error: reason }
    }
  }

  return { valid: true }
}

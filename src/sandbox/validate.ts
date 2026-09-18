/**
 * Sandbox Execution Engine — Script Validation (Defense-in-Depth)
 *
 * Pre-execution validation to reject obviously dangerous or malformed scripts
 * before they reach the QuickJS VM.
 *
 * SECURITY MODEL:
 * This validator is NOT the security boundary. The QuickJS VM itself provides
 * isolation via an allowlist of exposed APIs (see runner.ts `exposeFunction`
 * calls). The VM has no access to DOM, network, filesystem, or Node APIs
 * because they are never injected — QuickJS runs only what's explicitly given.
 *
 * This layer serves two purposes:
 * 1. Better error messages: Catch common mistakes early with explanatory errors
 *    (e.g., "fetch is not available" instead of a cryptic "undefined" error).
 * 2. Defense-in-depth: Block known-dangerous source patterns as an extra layer,
 *    even though the VM would reject them at runtime anyway.
 *
 * Hard resource limits (timeout, memory, mutation cap) are enforced by the VM
 * runtime in limits.ts — those cannot be bypassed by script content.
 */

// ─── Allowlisted Sandbox API (for documentation / future static analysis) ────
//
// These are the ONLY functions available inside the QuickJS VM:
//   getCell, getRawCell, getRange, getHeaders, getRowCount, getColCount,
//   findCells, setCell, setCells, setFormat, deleteRow, insertRow,
//   colToIndex, indexToCol, cellRef, parseRef, log
//
// Standard JS builtins (Math, String, Array, Object, JSON, etc.) are available
// via QuickJS's built-in implementation. No DOM, no network, no timers.

/** Patterns caught early with user-friendly error messages. */
const REJECTED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Dynamic code generation (would fail in VM anyway, but give better error)
  { pattern: /\beval\s*\(/, reason: 'eval() is not allowed — write your logic directly' },
  { pattern: /\bnew\s+Function\s*\(/, reason: 'new Function() is not allowed — write your logic directly' },
  { pattern: /\bimport\s*\(/, reason: 'Dynamic imports are not available in the sandbox' },
  { pattern: /\brequire\s*\(/, reason: 'require() is not available — the sandbox uses its own API' },

  // Prototype pollution attempts (QuickJS is isolated, but block for clarity)
  { pattern: /\b__proto__\b/, reason: '__proto__ access is not allowed' },
  { pattern: /\bconstructor\s*\[/, reason: 'Constructor bracket access is not allowed' },
  { pattern: /\bObject\.defineProperty\b/, reason: 'Object.defineProperty is not available' },
  { pattern: /\bObject\.setPrototypeOf\b/, reason: 'Prototype manipulation is not available' },
  { pattern: /\bReflect\b/, reason: 'Reflect API is not available in the sandbox' },
  { pattern: /\bProxy\b/, reason: 'Proxy is not available in the sandbox' },

  // Environment access (not injected into VM, but catch for better errors)
  { pattern: /\bglobalThis\b/, reason: 'globalThis is not available — use the spreadsheet API directly' },
  { pattern: /\bwindow\b/, reason: 'window is not available — this runs in an isolated sandbox' },
  { pattern: /\bdocument\b/, reason: 'document is not available — this runs in an isolated sandbox' },
  { pattern: /\bprocess\b/, reason: 'process is not available in the sandbox' },

  // Network (not available in VM, but give clear error)
  { pattern: /\bfetch\b/, reason: 'Network access is not available in the sandbox' },
  { pattern: /\bXMLHttpRequest\b/, reason: 'Network access is not available in the sandbox' },
  { pattern: /\bWebSocket\b/, reason: 'Network access is not available in the sandbox' },

  // Timers (not injected into QuickJS)
  { pattern: /\bsetTimeout\b/, reason: 'setTimeout is not available — use synchronous code' },
  { pattern: /\bsetInterval\b/, reason: 'setInterval is not available — use synchronous code' },
]

/** Maximum script length in characters. */
const MAX_SCRIPT_LENGTH = 10_000

export interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * Strip string literals and comments so REJECTED_PATTERNS don't false-positive
 * on LLM comments like "// group by window size" or strings containing "fetch".
 * Not a security boundary — the VM is.
 */
function stripStringsAndComments(code: string): string {
  let out = ''
  let i = 0
  while (i < code.length) {
    const c = code[i]
    const next = code[i + 1]

    // Line comment
    if (c === '/' && next === '/') {
      i += 2
      while (i < code.length && code[i] !== '\n') i++
      continue
    }
    // Block comment
    if (c === '/' && next === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
      continue
    }
    // String / template
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue }
        if (code[i] === quote) { i++; break }
        i++
      }
      out += ' '
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Validate a script before execution.
 *
 * Returns { valid: true } if the script passes all checks, or
 * { valid: false, error: "..." } with a user-friendly explanation.
 *
 * Note: Passing validation does NOT mean the script is safe — the QuickJS VM
 * enforces the real security boundary. This is a fast pre-check for UX.
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

  const scanned = stripStringsAndComments(code)
  for (const { pattern, reason } of REJECTED_PATTERNS) {
    if (pattern.test(scanned)) {
      return { valid: false, error: reason }
    }
  }

  return { valid: true }
}

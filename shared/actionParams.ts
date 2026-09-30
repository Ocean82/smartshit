/**
 * Model-output sanitising for action parameters.
 *
 * Anything that decides *whether* a change is safe to apply — previews,
 * signatures, approvals, execution state — must be produced by trusted local
 * code, never by the model. A model-supplied `previewChanges: []` used to
 * satisfy the script dry-run gate and let an unreviewed mutation through on the
 * first Apply.
 *
 * This module strips those fields at the trust boundary (server response
 * parsing and the LLM gateway) so the rest of the app can assume they are
 * locally authored.
 */

/**
 * Parameter keys a model must never control. `preview` is included because
 * locally-produced skills (e.g. `clean_sheet_data`) attach their own preview
 * *after* this sanitiser runs, so stripping it here is safe.
 */
const MODEL_UNTRUSTED_KEYS = [
  'previewChanges',
  'preview',
  'previewPatch',
  'scope',
  'prepared',
  'patch',
  'signature',
  'expectedRowSignature',
  'rowSignature',
  'approval',
  'approved',
  'approvedBy',
  'reviewed',
  'reviewedBy',
  'reviewedAt',
  'confirmGaps',
  'status',
  'state',
] as const

const MODEL_UNTRUSTED_KEY_SET: ReadonlySet<string> = new Set(MODEL_UNTRUSTED_KEYS)

/**
 * Return a copy of `params` with every model-untrusted key removed.
 * Non-object input yields an empty object (mirrors the previous behaviour of
 * treating a malformed `params` as `{}`).
 */
export function sanitizeActionParams(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return {}
  const source = params as Record<string, unknown>
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (MODEL_UNTRUSTED_KEY_SET.has(key)) continue
    clean[key] = value
  }
  return clean
}

/** True when the key is one a model is not allowed to supply. */
export function isModelUntrustedParamKey(key: string): boolean {
  return MODEL_UNTRUSTED_KEY_SET.has(key)
}

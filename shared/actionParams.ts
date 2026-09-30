/** Execution/approval metadata is trusted application state, never model input. */
const TRUSTED_ONLY_PARAMS = new Set([
  'previewChanges',
  'preview',
  'confirmGaps',
  'expectedRowSignature',
  'scope',
  'approved',
  'status',
  'approval',
  'approvalId',
  'executionState',
])

function stripNested(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNested)
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (!TRUSTED_ONLY_PARAMS.has(key)) clean[key] = stripNested(nested)
    }
    return clean
  }
  return value
}

export function stripApprovalParams(params: Record<string, unknown>): Record<string, unknown> {
  return stripNested(params) as Record<string, unknown>
}

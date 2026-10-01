/**
 * Tool-parameter validation against the shared registry.
 *
 * Model output is text-generated JSON. `parseResponse` filters tool names and
 * strips approval/preview fields (see `actionParams.ts`), but nothing checked
 * that the *parameters* match each tool's declared contract — so a required
 * param could be missing, or a value could arrive with the wrong type (a string
 * where a number is required, an object where a cell ref is required). Such an
 * action was shown to the user as a proposal and only failed later, inside a
 * handler, after the "preview → approve" dance implied it was sound.
 *
 * This validates a proposed action's params against the `params` schema already
 * declared in `toolRegistry.ts`. It is intentionally conservative: it rejects a
 * missing *required* param or a present param of the wrong declared type, and
 * ignores unknown extra keys (handlers tolerate those, and the dangerous ones
 * are already stripped upstream). It does not re-encode a parallel schema.
 */

import { getToolDefinition } from './toolRegistry.js'
import type { ToolParamSchema } from './toolTypes.js'

export interface ToolParamValidation {
  valid: boolean
  /** Human-readable reason, present when `valid` is false. */
  reason?: string
}

/** True when `value` matches the registry's declared param type. */
function matchesType(value: unknown, type: ToolParamSchema['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      // A plain object — not an array (arrays have their own type).
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    default:
      return false
  }
}

/**
 * Validate a proposed action's params against its tool's declared schema.
 *
 * An unknown tool is treated as valid here: tool-name allowlisting is a separate
 * gate (`ACTION_TOOL_NAMES`) that runs first, so reaching this with an unknown
 * tool should not happen, and failing closed on it would duplicate that check.
 */
export function validateToolParams(tool: string, params: Record<string, unknown>): ToolParamValidation {
  const definition = getToolDefinition(tool)
  if (!definition) return { valid: true }

  for (const schema of definition.params) {
    const present = Object.prototype.hasOwnProperty.call(params, schema.name)
    const value = params[schema.name]

    // A `null`/`undefined` value counts as absent — the model omitting a field.
    const hasValue = present && value !== null && value !== undefined

    if (!hasValue) {
      if (schema.required) {
        return { valid: false, reason: `${tool} is missing required parameter "${schema.name}"` }
      }
      continue
    }

    if (!matchesType(value, schema.type)) {
      return {
        valid: false,
        reason: `${tool} parameter "${schema.name}" must be ${schema.type}`,
      }
    }
  }

  return { valid: true }
}

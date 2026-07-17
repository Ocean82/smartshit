/**
 * Agent tool definitions — thin re-export of the canonical shared registry.
 * The single source of truth lives in `shared/toolRegistry.ts`, which is also
 * consumed by the server prompt and response allowlist.
 */

export {
  TOOL_REGISTRY,
  MUTATION_TOOL_NAMES,
  TEMPLATE_TOOL_NAMES,
  ACTION_TOOL_NAMES,
  getToolDefinition,
  resolveToolName,
  formatToolsForPrompt,
} from '@shared/toolRegistry'
export type { ToolDefinition, ToolParamSchema, ToolCategory, FormatCellsParams, FormatCondition } from '@shared/toolTypes'

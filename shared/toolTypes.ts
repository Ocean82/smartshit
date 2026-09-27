/**
 * Canonical tool contract types — shared between client and server.
 *
 * The tool registry (`toolRegistry.ts`) is the single source of truth for
 * tool names, parameters, and semantics. The server prompt, the server
 * response allowlist, and the client executor all derive from it.
 */

export type ToolCategory = 'mutate' | 'read' | 'template'

export type FormatConditionOperator =
  | 'eq'
  | 'lt'
  | 'gt'
  | 'lte'
  | 'gte'
  | 'contains'
  | 'negative'
  | 'positive'

/** Value-based targeting for format_cells ("highlight cells containing 4"). */
export interface FormatCondition {
  operator: FormatConditionOperator
  /** Comparison value. Not needed for negative/positive. */
  value?: string | number
}

/** Canonical params for the format_cells tool. */
export interface FormatCellsParams {
  /** A1-style range ("B2:D10"), column ("B" or "B:B"), or single cell. Omit to use selection/whole sheet. */
  range?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  fontSize?: number
  /** Font family name, e.g. "Arial", "Times New Roman", "Courier New". */
  fontFamily?: string
  bgColor?: string
  fontColor?: string
  /** Horizontal text alignment. */
  textAlign?: 'left' | 'center' | 'right'
  /** Vertical alignment of cell content. */
  verticalAlign?: 'top' | 'middle' | 'bottom'
  /** When true, long text wraps within the cell instead of truncating. */
  textWrap?: boolean
  /** Cell borders: a single style string applied to all four sides
   *  (e.g. "thin", "1px solid #000"), or a per-side object. */
  borders?: string | { top?: string; right?: string; bottom?: string; left?: string }
  /** Number format key (e.g. "currency", "percent", "date-iso", "accounting-neg"). */
  numberFormat?: string
  /** When present, only cells matching the condition are formatted. */
  condition?: FormatCondition
}

export interface ToolParamSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required?: boolean
}

export interface ToolDefinition {
  name: string
  category: ToolCategory
  description: string
  params: ToolParamSchema[]
  /** Example natural-language triggers (used for docs and parser hints). */
  examples: string[]
  /** When set, this tool is a legacy alias that dispatches to the named canonical tool. */
  aliasFor?: string
  /**
   * Hidden tools are valid for execution (allowlist, executor delegation) but
   * excluded from the LLM system prompt to keep it compact. Used for the
   * niche gallery templates, which are launched from the template gallery.
   */
  hidden?: boolean
}

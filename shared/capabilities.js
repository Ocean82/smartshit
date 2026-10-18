/**
 * Capability catalog — metadata-driven routing targets above raw tools.
 *
 * Tier 1 (regex parser) stays for precise phrases. Tier 2
 * (semanticCapabilityRouter) scores these capabilities via MiniLM against
 * `examples`, then executes the mapped tool/goal when confident.
 *
 * Plain ESM so Node precompute scripts can import without TS path aliases.
 */

/**
 * @typedef {'tool' | 'goal' | 'recipe'} CapabilityKind
 */

/**
 * @typedef {'none' | 'amount_column_sort' | 'amount_column_desc' | 'header_row_bold' | 'currency_selection' | 'percent_selection' | 'contains_value' | 'numeric_format' | 'filter_predicate' | 'negatives' | 'goal_by_category'} ParamStrategy
 */

/**
 * @typedef {object} CapabilityDef
 * @property {string} id
 * @property {CapabilityKind} kind
 * @property {string} description
 * @property {string[]} examples
 * @property {string} [tool]
 * @property {string} [goalId]
 * @property {Record<string, unknown>} [staticParams]
 * @property {string[]} [requiresParams]
 * @property {ParamStrategy} [paramStrategy]
 */

/** @type {CapabilityDef[]} */
export const CAPABILITIES = [
  {
    id: 'bold_headers',
    kind: 'tool',
    description: 'Bold the header row so column titles stand out.',
    examples: [
      'make headers stand out',
      'bold the top row',
      'make the header row bold',
      'emphasize the column titles',
    ],
    tool: 'format_cells',
    paramStrategy: 'header_row_bold',
  },
  {
    id: 'sort_column',
    kind: 'tool',
    description: 'Sort spreadsheet rows by values in a column, highest or lowest first.',
    examples: [
      'put biggest expenses first',
      'rank highest to lowest',
      'put the largest expenses first',
      'sort by amount descending',
      'order from largest to smallest',
      'sort by amount ascending',
      'put the smallest amounts first',
      'order from lowest to highest',
    ],
    tool: 'sort_sheet',
    requiresParams: ['column'],
    paramStrategy: 'amount_column_sort',
  },
  {
    id: 'filter_rows',
    kind: 'tool',
    description: 'Filter rows to show only those matching a column condition.',
    examples: [
      'show only Paid',
      'filter where status is Paid',
      'hide everything under 100',
      'only show rows over 500',
    ],
    tool: 'filter',
    requiresParams: ['column', 'condition', 'value'],
    paramStrategy: 'filter_predicate',
  },
  {
    id: 'format_currency',
    kind: 'tool',
    description: 'Format numbers as currency (dollars).',
    examples: [
      'show money properly',
      'make this look like dollars',
      'format as currency',
      'apply currency formatting',
      'show amounts as money',
    ],
    tool: 'format_cells',
    paramStrategy: 'currency_selection',
  },
  {
    id: 'format_percent',
    kind: 'tool',
    description: 'Format numbers as percentages.',
    examples: [
      'show these as percentages',
      'format as percent',
      'make this column percentages',
      'show as a percentage',
      'display these numbers as percentages',
    ],
    tool: 'format_cells',
    paramStrategy: 'percent_selection',
  },
  {
    id: 'format_as_table',
    kind: 'tool',
    description: 'Format the data range as a styled table with headers and banded rows.',
    examples: [
      'format this as a table',
      'make it look like a proper table',
      'convert to a table with banded rows',
      'apply table formatting',
      'format the range as a table',
    ],
    tool: 'format_as_table',
    staticParams: { theme: 'blue' },
    paramStrategy: 'none',
  },
  {
    id: 'highlight_contains',
    kind: 'tool',
    description: 'Highlight cells whose display value contains a given text or number.',
    examples: [
      'highlight cells that have a 4',
      'highlight cells containing 4',
      'mark cells that contain the number 4',
      'color cells with value 4',
    ],
    tool: 'format_cells',
    requiresParams: ['condition'],
    paramStrategy: 'contains_value',
  },
  {
    id: 'highlight_numbers',
    kind: 'tool',
    description: 'Highlight or color cells whose value is numeric (a number).',
    examples: [
      'highlight cells that contain numbers',
      'color cells with numbers red',
      'change all cells with numbers to red',
      'make numeric cells red',
      'highlight numeric values',
      'highlight all the numbers',
    ],
    tool: 'format_cells',
    paramStrategy: 'numeric_format',
  },
  {
    id: 'highlight_negatives',
    kind: 'tool',
    description: 'Highlight cells with negative numeric values.',
    examples: [
      'highlight weird negative values',
      'highlight negatives',
      'mark negative numbers in red',
      'flag negative amounts',
      'highlight cells with negative numbers',
    ],
    tool: 'format_cells',
    staticParams: {
      condition: { operator: 'negative' },
      bgColor: '#FEE2E2',
    },
    paramStrategy: 'negatives',
  },
  {
    id: 'professionalize_sheet',
    kind: 'recipe',
    // RESOLVED VIA THE TIER-1 REGEX PARSER (shared/spreadsheetPhrases.ts /
    // src/agent/parser.ts), NOT the semantic router. This recipe IS embedded and
    // scored by Tier-2 (bootstrapCapabilityEmbeddings iterates all examples), but
    // semanticCapabilityRouter.ts explicitly passes on kind:'recipe'
    // (fulfillCapabilityScore returns null) so a paraphrase that scores here
    // defers to Tier-1/LLM instead of resolving to a steps-less execute_macro.
    // This entry exists for catalog documentation/discoverability only (spec §4,
    // plan decision 6). The makeover is a value-safe, format-only execute_macro
    // pass; the totals row is a separate, opt-in, preview-only follow-up.
    description:
      'Professionalize the whole sheet: value-safe formatting pass; totals only if explicitly asked.',
    examples: [
      'make this look professional',
      'clean up the formatting',
      'format this like a pro',
      'professionalize my sheet',
      'make my spreadsheet look professional',
    ],
    tool: 'execute_macro',
  },
  {
    id: 'style_header',
    kind: 'recipe',
    // RESOLVED VIA THE TIER-1 REGEX PARSER (parseStyleRecipePhrase →
    // src/agent/parser.ts), NOT the semantic router. Like professionalize_sheet
    // this recipe IS embedded + scored by Tier-2, but semanticCapabilityRouter.ts
    // passes on kind:'recipe' (fulfillCapabilityScore returns null), so a
    // paraphrase that scores here defers to Tier-1/LLM instead of resolving to a
    // steps-less tool call. Catalog documentation/discoverability only (spec §4).
    // Format-only (bold + fill + bottom border) — writes no cell values. Kept
    // DISTINCT from bold_headers (plain bold via format_cells) so the two do not
    // collide in embedding space.
    description:
      'Style the header row as a proper header (bold, fill, bottom border), not just plain bold.',
    examples: [
      'style the header row',
      'make a header row',
      'style the top row',
      'format the header row',
    ],
    tool: 'style_recipe',
  },
  {
    id: 'add_totals_row',
    kind: 'recipe',
    // RESOLVED VIA THE TIER-1 REGEX PARSER (parseStyleRecipePhrase →
    // src/agent/parser.ts), NOT the semantic router (kind:'recipe' is router-inert
    // per semanticCapabilityRouter.ts). Catalog documentation/discoverability only.
    // WRITES DATA: adds a "Total" label + SUM formulas, so it resolves to the
    // style_recipe tool, carries persistenceCaveat('style_recipe'), is preview-only,
    // and is NEVER auto-applied — even under Auto posture (style_recipe is excluded
    // from AUTO_APPLY_LOW_RISK_TOOLS in src/lib/applyPosture.ts).
    description:
      'Add or refresh a totals row at the bottom (label + SUM formulas). Writes cell values; preview-only.',
    examples: [
      'add a totals row',
      'sum at the bottom',
      'add a grand total row',
    ],
    tool: 'style_recipe',
  },
  {
    id: 'table_polish',
    kind: 'recipe',
    // RESOLVED VIA THE TIER-1 REGEX PARSER (parseStyleRecipePhrase →
    // src/agent/parser.ts), NOT the semantic router (kind:'recipe' is router-inert
    // per semanticCapabilityRouter.ts). Catalog documentation/discoverability only.
    // WRITES DATA: calls generateTableTotals, so it resolves to the style_recipe
    // tool, carries persistenceCaveat('style_recipe'), is preview-only, and is
    // NEVER auto-applied (style_recipe is excluded from AUTO_APPLY_LOW_RISK_TOOLS).
    // "format as a table" / banded-table styling stays owned by format_as_table
    // (a value-safe format_cells pass); this entry owns the explicit "polish"
    // request that also generates totals.
    description:
      'Polish the table with full styling and generated totals. Writes cell values; preview-only.',
    examples: [
      'polish this table',
      'make this table look polished',
    ],
    tool: 'style_recipe',
  },
  {
    id: 'fit_columns',
    kind: 'recipe',
    // DISCOVERABILITY-ONLY, and INTENTIONALLY ROUTER-INERT (kind:'recipe' →
    // semanticCapabilityRouter.ts fulfillCapabilityScore returns null). It is
    // embedded + scored by Tier-2 but NEVER resolved, exactly like
    // professionalize_sheet.
    //
    // IMPORTANT — there is NO backing mechanism for true COLUMN auto-fit yet:
    // the auto_fit tool is row-only (handleAutoFit → ctx.autoFitRows), and
    // set_column_width needs an explicit numeric width (no "auto" mode). So this
    // entry is catalog metadata ONLY; `tool: 'auto_fit'` below documents the
    // intended target, NOT a working route. There is deliberately NO Tier-1
    // regex for "auto-size the columns" / "fix the column widths" either, because
    // routing those to row auto_fit (wrong) or widthless set_column_width
    // (failing) would ship broken behavior. Adding a real column-autofit
    // mechanism is a SEPARATE follow-up / backlog item.
    description:
      'Fit column widths to their content (discoverability only; no column auto-fit mechanism yet).',
    examples: [
      'fix the column widths',
      'auto-size the columns',
      'auto-fit the columns',
    ],
    tool: 'auto_fit',
  },
  {
    id: 'totals_by_category',
    kind: 'goal',
    description: 'Show totals grouped by category (chart or summary).',
    examples: [
      'show me totals by category',
      'break down spending by category',
      'group amounts by category',
      'totals per category',
      'category breakdown',
    ],
    goalId: 'by_category',
    paramStrategy: 'goal_by_category',
  },
]

/**
 * Map of capability id → examples for embedding bootstrap / precompute.
 * @returns {Record<string, string[]>}
 */
export function capabilityExamplesMap() {
  /** @type {Record<string, string[]>} */
  const map = {}
  for (const cap of CAPABILITIES) {
    map[cap.id] = cap.examples
  }
  return map
}

/**
 * Deterministic unsigned 32-bit FNV-1a hash of capability examples.
 * Used to detect stale precomputed capability-vectors.bin.
 * @param {Record<string, string[]>} [phrases]
 * @returns {number}
 */
export function capabilityPhrasesHash(phrases = capabilityExamplesMap()) {
  const serialized = Object.keys(phrases)
    .sort()
    .map((key) => `${key}:${(phrases[key] ?? []).join('|')}`)
    .join(';')

  let hash = 0x811c9dc5
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * @param {string} id
 * @returns {CapabilityDef | undefined}
 */
export function getCapability(id) {
  return CAPABILITIES.find((c) => c.id === id)
}

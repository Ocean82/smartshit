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
 * @typedef {'none' | 'amount_column_desc' | 'header_row_bold' | 'currency_selection' | 'contains_value' | 'filter_predicate' | 'negatives' | 'goal_by_category'} ParamStrategy
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
    ],
    tool: 'sort_sheet',
    requiresParams: ['column'],
    paramStrategy: 'amount_column_desc',
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
    id: 'format_as_table',
    kind: 'tool',
    description: 'Format the data range as a styled table with headers and banded rows.',
    examples: [
      'make this easier to read',
      'clean up the formatting',
      'format this as a table',
      'make it look like a proper table',
      'tidy up the sheet layout',
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
    id: 'highlight_negatives',
    kind: 'tool',
    description: 'Highlight cells with negative numeric values.',
    examples: [
      'highlight weird negative values',
      'highlight negatives',
      'mark negative numbers in red',
      'highlight weird values',
      'flag negative amounts',
    ],
    tool: 'format_cells',
    staticParams: {
      condition: { operator: 'negative' },
      bgColor: '#FEE2E2',
    },
    paramStrategy: 'negatives',
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

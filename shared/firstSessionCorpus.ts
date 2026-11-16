/**
 * First-session prompt corpus.
 *
 * Phrases a new user actually types in their first minutes, each with the
 * INTENDED outcome. Two layers are checked against it:
 *   - server: `resolveIntent` (mode gate + act templates), which returns its
 *     actions to the client without ever calling the LLM
 *     (server/src/firstSessionCorpus.test.ts)
 *   - client: the instant regex parser (src/agent/firstSessionCorpus.test.ts)
 *
 * Why this exists: "highlight rent" used to resolve to an unscoped
 * `format_cells` that recoloured every cell. No test covered the gap between
 * "the user named a target" and "the resolver mapped it". Add a row here
 * whenever a real prompt misbehaves.
 *
 * `defer` means "no deterministic action; the LLM (which sees the sheet) takes
 * over". That is the correct answer for any target a resolver cannot map. A
 * wrong deterministic guess is worse than deferring.
 */

export type Expect =
  | { kind: 'defer' }
  /** An action for `tool` whose params contain at least `params`. */
  | { kind: 'tool'; tool: string; params?: Record<string, unknown> }

export interface CorpusCase {
  prompt: string
  /** Outcome through the server path. Omit to not assert. */
  server?: Expect
  /** Outcome through the client regex parser. Omit to not assert. */
  client?: Expect
  /** Why this row exists, or the roadmap item that will flip it. */
  note?: string
}

const defer: Expect = { kind: 'defer' }
const tool = (t: string, params?: Record<string, unknown>): Expect => ({ kind: 'tool', tool: t, params })

export const FIRST_SESSION_CORPUS: CorpusCase[] = [
  // ── Highlight / colour: scope must be explicit or deferred ──────────────
  { prompt: 'highlight cell B7', server: tool('format_cells', { range: 'B7' }) },
  { prompt: 'highlight B7', server: tool('format_cells', { range: 'B7' }), client: defer },
  { prompt: 'highlight A1:C3 in red', server: tool('format_cells', { range: 'A1:C3' }) },
  { prompt: 'highlight column C', server: tool('format_cells', { range: 'C' }), client: defer },
  { prompt: 'highlight row 5', server: tool('format_cells', { range: 'A5:Z5' }), client: defer },
  { prompt: 'highlight the header row', server: tool('format_cells', { range: 'A1:Z1' }) },
  { prompt: 'bold the headers', server: tool('format_cells', { range: 'A1:Z1', bold: true }) },
  { prompt: 'make the first row bold', server: tool('format_cells', { range: 'A1:Z1', bold: true }) },
  {
    prompt: 'can you highlight cell B7?',
    server: defer,
    note: 'DECISION (server/src/mode.test.ts): a question-phrased message never acts. The client parser strips "can you" and acts only when it can scope the request; otherwise the user gets an explanation, not an action. Revisit if polite commands matter more than that safety rule.',
  },
  { prompt: 'please highlight B7', server: tool('format_cells', { range: 'B7' }) },
  { prompt: 'highlight negative numbers', server: tool('format_cells', { condition: { operator: 'negative' } }) },
  { prompt: 'highlight cells containing rent', server: tool('format_cells', { condition: { operator: 'contains', value: 'rent' } }) },
  { prompt: 'highlight the cell that says groceries', server: tool('format_cells', { condition: { operator: 'contains', value: 'groceries' } }) },
  { prompt: 'make everything bold', server: tool('format_cells', { bold: true, range: 'all' }) },
  { prompt: 'change all text to red', server: tool('format_cells', { range: 'all' }) },

  // ── Highlight a thing we cannot map: defer, never guess ─────────────────
  { prompt: 'highlight rent', server: defer, client: defer },
  { prompt: 'highlight groceries', server: defer, client: defer },
  { prompt: 'highlight the total', server: defer, client: defer },
  { prompt: 'highlight the largest value', server: defer },
  { prompt: 'highlight the highest amount', server: defer },
  { prompt: 'highlight the lowest expense', server: defer },
  { prompt: 'highlight the cell with the biggest number', server: defer },
  { prompt: 'highlight duplicates', server: defer, client: defer },
  { prompt: 'highlight the errors', server: defer, client: defer },
  { prompt: 'highlight empty cells', server: defer, client: defer },
  { prompt: 'highlight the blank cells', server: defer },
  { prompt: 'highlight anything over 500', server: defer, client: tool('format_cells', { condition: { operator: 'gt', value: 500 } }) },
  { prompt: 'highlight where the category is food', server: defer },
  { prompt: 'highlight all rows containing Netflix', server: defer },
  { prompt: 'color the total green', server: defer },
  { prompt: 'make the total bold', server: defer },
  { prompt: 'make the rent text red', server: defer },
  { prompt: 'make it red', server: defer },
  { prompt: 'make it look professional', server: defer },

  // ── No target named: apply to the selection (the tool asks if none) ─────
  { prompt: 'highlight in red', server: tool('format_cells') },
  { prompt: 'highlight this cell', server: tool('format_cells') },
  { prompt: 'highlight it', server: tool('format_cells') },
  { prompt: 'highlight', server: tool('format_cells') },
  { prompt: 'bold this', server: tool('format_cells', { bold: true }) },
  { prompt: 'make the text red', server: tool('format_cells') },
  { prompt: 'format as currency', server: tool('format_cells', { numberFormat: 'currency' }), client: tool('format_cells', { numberFormat: 'currency' }) },

  // ── Clear / delete: never widen to the whole sheet ──────────────────────
  { prompt: 'clear the sheet', server: tool('clear_sheet') },
  { prompt: 'clear everything', server: tool('clear_sheet') },
  { prompt: 'clear all cells', server: tool('clear_sheet') },
  { prompt: 'clear cell B2', server: defer },
  { prompt: 'clear column C', server: defer },
  { prompt: 'show empty cells', server: defer },
  { prompt: 'delete row 3', server: defer, client: tool('delete_row', { row: 3 }) },

  // ── Find / go to / select: no tool exists yet (roadmap 1.1) ─────────────
  { prompt: 'find rent', server: defer, client: defer, note: 'roadmap 1.1: find/go-to/select' },
  { prompt: 'find groceries', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'find the biggest expense', server: defer, note: 'roadmap 1.1' },
  { prompt: 'where is the total', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'where is the rent', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'go to cell C5', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'select column B', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'select cell C5', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'search for netflix', server: defer, client: defer, note: 'roadmap 1.1' },
  { prompt: 'locate the total row', server: defer, note: 'roadmap 1.1' },

  // ── Formulas and data ops ───────────────────────────────────────────────
  { prompt: 'sum column C', server: tool('apply_formula', { column: 'C', formula: 'SUM' }) },
  { prompt: 'add up column B', server: tool('apply_formula', { column: 'B', formula: 'SUM' }) },
  { prompt: 'average column C', server: tool('apply_formula', { column: 'C', formula: 'AVERAGE' }) },
  { prompt: 'sort by amount', client: tool('sort_sheet', { column: 'Amount' }) },
  { prompt: 'add a total row', server: tool('style_recipe', { recipe: 'total_row' }), client: tool('style_recipe', { recipe: 'total_row' }) },

  // ── Creating things ─────────────────────────────────────────────────────
  { prompt: 'create a monthly budget', server: tool('create_budget_template') },
  { prompt: 'make a sales tracker', server: tool('create_sales_tracker') },

  // ── Questions, negations and chatter must never mutate ──────────────────
  { prompt: 'what does this sheet contain', server: defer, client: defer },
  { prompt: 'what is the highest amount', server: defer },
  { prompt: 'explain the total', server: defer },
  { prompt: 'how do I highlight a cell?', server: defer, client: defer },
  { prompt: "don't highlight anything", server: defer, client: defer },
  { prompt: 'do not clear the sheet', server: defer, client: defer },
  { prompt: 'hello', server: defer, client: defer },
]

/** Prompts that open with a styling verb. They must never write formulas, build templates, or wipe the sheet. */
export const STYLING_VERB_PROMPTS = FIRST_SESSION_CORPUS.map((c) => c.prompt).filter((p) =>
  /^(?:please\s+|can you\s+|could you\s+)?(?:highlight|colou?r|bold|shade)\b/i.test(p),
)

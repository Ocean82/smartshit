/**
 * Shared extraction for "highlight cells containing …" style phrases.
 * Keeps client agent-parser and server actTemplates in lockstep so article
 * stripping cannot drift ("contain a 4" → "4", never "a").
 */

// Plural `numbers` is deliberately NOT in the filler-skip group: a "contains
// numbers" (type) phrase must land the capture on `numbers` so the STOP guard
// below can reject it and routing can fall through to highlight_numbers.
// Singular `number` stays as filler so "contains the number 4" → "4".
// Group 1 captures an opening quote (if present); group 2 captures the value.
// An explicitly quoted value is a deliberate literal, so the stop-word guard
// below is skipped for it ("containing \"red\"" means the text red, not the
// color cue). An unquoted stop word is a type/color request and is rejected.
const CONTAINS_VALUE_RE =
  /cells?\s+(?:that\s+)?(?:contain(?:ing|s)?|with|having|have|has)\s+(?:(?:a|an|the|any|some|each|every|number|value|values|text|digit|digits|letter|letters|char|character|characters)\s+)*(["']?)([\w.$-]+)["']?/

/**
 * Stop words that are never a real literal to search for: number-type words and
 * color words. Capturing one means the phrase is a type/color request (e.g.
 * "contain numbers red"), which must defer to highlight_numbers rather than
 * becoming a bogus `contains "numbers"` / `contains "red"` action. Exported so
 * the second contains-capture path (resolveParams `contains_value` fallback)
 * reuses the exact same list.
 */
export const CONTAINS_STOP_WORDS = new Set([
  'number', 'numbers', 'numeric', 'to',
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'gray', 'grey',
])

/**
 * Extract the target value from a cells-containing / cells-with phrase.
 * Returns null when the phrase does not match, or when an UNQUOTED stop word is
 * captured (a type/color cue that must defer to highlight_numbers). A value the
 * user explicitly quoted is kept even if it is a stop word, because the quotes
 * signal a deliberate literal search (e.g. `containing "red"`).
 */
export function extractCellContainsValue(text: string): string | null {
  const match = text.toLowerCase().match(CONTAINS_VALUE_RE)
  const value = match?.[2] ?? null
  if (value == null) return null
  const wasQuoted = match?.[1] === '"' || match?.[1] === "'"
  if (!wasQuoted && CONTAINS_STOP_WORDS.has(value)) return null
  return value
}

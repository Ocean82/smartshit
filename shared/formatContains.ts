/**
 * Shared extraction for "highlight cells containing …" style phrases.
 * Keeps client agent-parser and server actTemplates in lockstep so article
 * stripping cannot drift ("contain a 4" → "4", never "a").
 */

// Plural `numbers` is deliberately NOT in the filler-skip group: a "contains
// numbers" (type) phrase must land the capture on `numbers` so the STOP guard
// below can reject it and routing can fall through to highlight_numbers.
// Singular `number` stays as filler so "contains the number 4" → "4".
const CONTAINS_VALUE_RE =
  /cells?\s+(?:that\s+)?(?:contain(?:ing|s)?|with|having|have|has)\s+(?:(?:a|an|the|any|some|each|every|number|value|values|text|digit|digits|letter|letters|char|character|characters)\s+)*["']?([\w.$-]+)["']?/

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
 * Returns null when the phrase does not match or captures a stop word.
 */
export function extractCellContainsValue(text: string): string | null {
  const match = text.toLowerCase().match(CONTAINS_VALUE_RE)
  const value = match?.[1] ?? null
  if (value == null) return null
  return CONTAINS_STOP_WORDS.has(value) ? null : value
}

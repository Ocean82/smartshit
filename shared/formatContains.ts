/**
 * Shared extraction for "highlight cells containing …" style phrases.
 * Keeps client agent-parser and server actTemplates in lockstep so article
 * stripping cannot drift ("contain a 4" → "4", never "a").
 */

const CONTAINS_VALUE_RE =
  /cells?\s+(?:that\s+)?(?:contain(?:ing|s)?|with|having|have|has)\s+(?:(?:a|an|the|any|some|each|every|number|numbers|value|values|text|digit|digits|letter|letters|char|character|characters)\s+)*["']?([\w.$-]+)["']?/

/**
 * Extract the target value from a cells-containing / cells-with phrase.
 * Returns null when the phrase does not match.
 */
export function extractCellContainsValue(text: string): string | null {
  const match = text.toLowerCase().match(CONTAINS_VALUE_RE)
  return match?.[1] ?? null
}

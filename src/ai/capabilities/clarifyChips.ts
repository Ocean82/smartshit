/**
 * Capability clarify helpers — NL chips + LLM escape hatch + pick short-circuit.
 *
 * Option A: chips are natural-language messages re-entering the pipeline.
 * Capability chips embed an invisible pick prefix so Tier 2 can force that
 * capability on re-entry (no clarification loop). "Something else…" embeds a
 * skip prefix so Tier 2 does not claim again.
 *
 * Visible chat bubbles always show the NL label / original utterance (prefixes
 * stripped in sendMessage).
 */

export const CAPABILITY_SKIP_PREFIX = '\u200Bcapability-skip:\u200B'
export const CAPABILITY_PICK_PREFIX = '\u200Bcapability-pick:'
export const CAPABILITY_PICK_SEP = '\u200B'
export const CAPABILITY_SOMETHING_ELSE_LABEL = 'Something else…'

/** Force act vs analyze after regex↔NLP intent conflict (avoids clarify loops). */
export const MODE_PICK_PREFIX = '\u200Bmode-pick:'
export const MODE_PICK_SEP = '\u200B'
export type ModePickMode = 'act' | 'explain'

export function isCapabilitySkipMessage(message: string): boolean {
  return message.startsWith(CAPABILITY_SKIP_PREFIX)
}

export function stripCapabilitySkipPrefix(message: string): string {
  if (!isCapabilitySkipMessage(message)) return message
  return message.slice(CAPABILITY_SKIP_PREFIX.length)
}

/** Encode original utterance so send can strip prefix + skip Tier 2. */
export function capabilitySkipMessage(original: string): string {
  return `${CAPABILITY_SKIP_PREFIX}${original.trim()}`
}

/**
 * Encode a capability chip: invisible id + visible NL label.
 * Example: `\u200Bcapability-pick:format_as_table\u200BFormat this as a table`
 */
export function capabilityPickMessage(capabilityId: string, label: string): string {
  const id = capabilityId.trim()
  const text = label.trim()
  return `${CAPABILITY_PICK_PREFIX}${id}${CAPABILITY_PICK_SEP}${text}`
}

export function parseCapabilityPickMessage(
  message: string,
): { capabilityId: string; label: string } | null {
  if (!message.startsWith(CAPABILITY_PICK_PREFIX)) return null
  const rest = message.slice(CAPABILITY_PICK_PREFIX.length)
  const sep = rest.indexOf(CAPABILITY_PICK_SEP)
  if (sep <= 0) return null
  const capabilityId = rest.slice(0, sep).trim()
  const label = rest.slice(sep + CAPABILITY_PICK_SEP.length).trim()
  if (!capabilityId || !label) return null
  return { capabilityId, label }
}

export function isCapabilityPickMessage(message: string): boolean {
  return parseCapabilityPickMessage(message) !== null
}

/**
 * Encode a mode chip: invisible mode + original utterance.
 * Example: `\u200Bmode-pick:act\u200Bsort by Amount`
 */
export function modePickMessage(mode: ModePickMode, original: string): string {
  return `${MODE_PICK_PREFIX}${mode}${MODE_PICK_SEP}${original.trim()}`
}

export function parseModePickMessage(
  message: string,
): { mode: ModePickMode; original: string } | null {
  if (!message.startsWith(MODE_PICK_PREFIX)) return null
  const rest = message.slice(MODE_PICK_PREFIX.length)
  const sep = rest.indexOf(MODE_PICK_SEP)
  if (sep <= 0) return null
  const mode = rest.slice(0, sep).trim()
  const original = rest.slice(sep + MODE_PICK_SEP.length).trim()
  if ((mode !== 'act' && mode !== 'explain') || !original) return null
  return { mode, original }
}

export function isModePickMessage(message: string): boolean {
  return parseModePickMessage(message) !== null
}

/** Chip UI label — hide skip/pick encoding from users. */
export function suggestionChipLabel(suggestion: string): string {
  if (isCapabilitySkipMessage(suggestion)) return CAPABILITY_SOMETHING_ELSE_LABEL
  const modePick = parseModePickMessage(suggestion)
  if (modePick) return modePick.mode === 'act' ? 'Change the sheet' : 'Analyze / explain'
  const pick = parseCapabilityPickMessage(suggestion)
  if (pick) return pick.label
  return suggestion
}

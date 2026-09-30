/**
 * Request safety policy — shared by the client agent parser, the client
 * routing pipeline, the local fallback and the server intent fast-path.
 *
 * The regex tool parser matches *fragments* of an utterance. That is fine for
 * a bare imperative ("set A1 to 100") but wrong for anything that merely
 * mentions an imperative: negations, explanations, hypotheticals and quoted
 * examples all contain the same command fragments without asking for a change.
 *
 * This module answers one question — "is this utterance a direct command?" —
 * so every route can apply the same answer *before* it mutates anything.
 *
 * Everything here is deliberately conservative: it only returns `true` when the
 * utterance is clearly not a command. A false negative (an odd phrasing that
 * slips through) is handled by the existing question/ambiguity guards; a false
 * positive would silently drop a legitimate command.
 */

/** Why an utterance was classified as a non-command (for tests + telemetry). */
export type NonCommandReason = 'negated' | 'explanatory' | 'hypothetical' | 'quoted'

export interface RequestSafety {
  /** True when the utterance must not be treated as a direct command. */
  isNonCommand: boolean
  /** Populated when `isNonCommand` is true. */
  reason?: NonCommandReason
}

/** Leading politeness/noise that never changes whether something is a command. */
const POLITE_LEAD = String.raw`(?:please\s+|kindly\s+|hey\s+|ok(?:ay)?\s+|just\s+)*`

/** Imperative verbs a spreadsheet request can resolve to. */
const COMMAND_VERBS = [
  'set', 'put', 'write', 'enter', 'type', 'delete', 'remove', 'clear', 'wipe', 'erase',
  'reset', 'add', 'insert', 'append', 'sort', 'order', 'filter', 'format', 'bold', 'italic',
  'color', 'colour', 'highlight', 'rename', 'replace', 'update', 'change', 'modify', 'create',
  'build', 'make', 'generate', 'export', 'download', 'fill', 'apply', 'move', 'copy',
  'duplicate', 'hide', 'show', 'merge', 'sum', 'total', 'average', 'count', 'chart', 'graph',
  'overwrite', 'populate', 'blank',
  // Irregular past forms the suffix rules below cannot derive.
  'made', 'built', 'wrote',
]

/**
 * Verb stems plus their inflections, so "sorting" and "wiped" both count as the
 * verb "sort"/"wipe". The `d` branch covers stems that drop their final "e".
 */
const COMMAND_VERB_RE = new RegExp(
  String.raw`\b(?:${COMMAND_VERBS.map((verb) => `${verb}(?:s|es|ed|ing|d)?`).join('|')})\b`,
  'i',
)

/** "do not …", "don't …", "never …" — an explicit refusal to perform the action. */
const NEGATION_LEAD_RE = new RegExp(
  `^${POLITE_LEAD}(?:do\\s*n(?:o|')?t|do\\s+not|don'?t|dont|never|avoid|refrain\\s+from|stop|` +
    String.raw`shouldn'?t|should\s+not|must\s+not|cannot|can'?t|won'?t|will\s+not|` +
    String.raw`no\s+need\s+to|there'?s\s+no\s+need\s+to|i\s+don'?t\s+want\s+you\s+to)\b`,
  'i',
)

/** Negation embedded mid-sentence, directly in front of the verb it refuses. */
const NEGATED_VERB_RE = new RegExp(
  String.raw`\b(?:do\s+not|don'?t|dont|should\s+not|shouldn'?t|must\s+not|cannot|can'?t|won'?t|will\s+not|would\s+not|wouldn'?t|shall\s+not)\s+` +
    `(?:${COMMAND_VERBS.map((verb) => `${verb}(?:s|es|ed|ing|d)?`).join('|')})\\b`,
  'i',
)

/** "explain how to …", "what does … do", "how do I …" — asking, not doing. */
const EXPLANATORY_LEAD_RE = new RegExp(
  `^${POLITE_LEAD}(?:` +
    [
      'explain',
      'describe',
      'clarify',
      String.raw`summari[sz]e`,
      String.raw`tell\s+me`,
      String.raw`show\s+me`,
      String.raw`walk\s+me\s+through`,
      String.raw`teach\s+me`,
      String.raw`give\s+me`,
      String.raw`help\s+me\s+understand`,
      String.raw`i\s+(?:want|would\s+like)\s+to\s+(?:know|understand)`,
      String.raw`what\s+does`,
      String.raw`what\s+is`,
      String.raw`what\s+are`,
      String.raw`what\s+makes`,
      String.raw`what\s+happens`,
      String.raw`what\s+would\s+happen`,
      String.raw`what\s+should`,
      String.raw`what\s+will`,
      String.raw`how\s+do(?:es)?\s+(?:i|you|we|this|that|it)`,
      String.raw`how\s+to\b`,
      String.raw`how\s+can\s+(?:i|you|we)`,
      String.raw`how\s+should\s+(?:i|you|we)`,
      String.raw`why\s+does`,
      String.raw`why\s+is`,
      String.raw`why\s+are`,
      String.raw`why\s+would`,
      String.raw`when\s+should\s+(?:i|you|we)`,
      String.raw`where\s+should\s+(?:i|you|we)`,
      String.raw`which\s+(?:column|cell|row|formula|function|one)`,
      String.raw`is\s+there\s+a\s+way`,
      String.raw`can\s+you\s+explain`,
      String.raw`could\s+you\s+explain`,
      String.raw`in\s+other\s+words`,
    ].join('|') +
    ')\\b',
  'i',
)

/** "what if I …", "suppose …", "imagine …" — a scenario, not an instruction. */
const HYPOTHETICAL_LEAD_RE = new RegExp(
  `^${POLITE_LEAD}(?:` +
    [
      String.raw`what\s+if`,
      String.raw`if\s+i\b`,
      'imagine',
      'suppose',
      String.raw`let'?s\s+say`,
      String.raw`say\s+i\b`,
      'pretend',
      'assume',
      'hypothetically',
      String.raw`in\s+theory`,
      String.raw`what\s+would\s+happen`,
      String.raw`what\s+happens\s+if`,
      String.raw`for\s+example\s+if`,
    ].join('|') +
    ')\\b',
  'i',
)

const WHAT_IF_RE = /\bwhat\s+if\b/i

/**
 * Quoted spans. Single quotes only count when they are real quotes (not the
 * apostrophe in "don't"), so the opening quote must not follow a letter.
 */
const QUOTED_SPAN_RE = /"([^"]*)"|(?<![A-Za-z])'([^']*)'(?![A-Za-z])|“([^”]*)”/g

/** Verbs that *produce text* rather than mutate a sheet. */
const META_QUOTE_LEAD_RE = new RegExp(
  `^${POLITE_LEAD}(?:say|write|type|print|echo|repeat|respond\\s+with|reply\\s+with|` +
    String.raw`answer\s+with|output|show\s+me|tell\s+me)\b`,
  'i',
)

interface Span {
  start: number
  end: number
}

function findQuotedSpans(message: string): Span[] {
  const spans: Span[] = []
  const re = new RegExp(QUOTED_SPAN_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(message)) !== null) {
    // Guard against zero-length matches looping forever.
    if (match[0].length === 0) {
      re.lastIndex += 1
      continue
    }
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  return spans
}

/**
 * True when the text after a leading phrase still contains a command verb.
 *
 * The guard is deliberately narrow: it only fires when the utterance both opens
 * with a non-command framing *and* goes on to talk about an operation. That is
 * what makes "explain how to set A1 to 100" dangerous while "what is my
 * cheapest expense?" stays a normal data question.
 */
function hasCommandAfter(trimmed: string, leadRe: RegExp): boolean {
  const match = trimmed.match(leadRe)
  if (!match) return false
  return COMMAND_VERB_RE.test(trimmed.slice(match[0].length))
}

/**
 * True when the only command-looking text in the utterance sits inside quotes
 * (or follows a "say …" meta-verb). "set A1 to 100" typed at the prompt is a
 * command; `say "set A1 to 100"` is a request to produce that text.
 */
function isQuotedOnlyCommand(message: string): boolean {
  const spans = findQuotedSpans(message)
  if (spans.length === 0) return false

  const quoted = spans.map((s) => message.slice(s.start, s.end)).join(' ')
  if (!COMMAND_VERB_RE.test(quoted)) return false

  if (META_QUOTE_LEAD_RE.test(message)) return true

  let outside = ''
  let cursor = 0
  for (const span of spans) {
    outside += message.slice(cursor, span.start) + ' '
    cursor = span.end
  }
  outside += message.slice(cursor)

  return !COMMAND_VERB_RE.test(outside)
}

/**
 * Classify an utterance as a direct command or not.
 *
 * Non-commands must be routed to the explanatory/conversational path — never
 * to a regex mutation stage, a goal executor, or a template applier.
 */
export function classifyRequestSafety(message: string): RequestSafety {
  const trimmed = message.trim()
  if (!trimmed) return { isNonCommand: false }

  if (NEGATED_VERB_RE.test(trimmed) || hasCommandAfter(trimmed, NEGATION_LEAD_RE)) {
    return { isNonCommand: true, reason: 'negated' }
  }

  if (hasCommandAfter(trimmed, HYPOTHETICAL_LEAD_RE) || hasCommandAfter(trimmed, WHAT_IF_RE)) {
    return { isNonCommand: true, reason: 'hypothetical' }
  }

  if (hasCommandAfter(trimmed, EXPLANATORY_LEAD_RE)) {
    return { isNonCommand: true, reason: 'explanatory' }
  }

  if (isQuotedOnlyCommand(trimmed)) {
    return { isNonCommand: true, reason: 'quoted' }
  }

  return { isNonCommand: false }
}

/** Convenience predicate for call sites that do not need the reason. */
export function isNonCommandRequest(message: string): boolean {
  return classifyRequestSafety(message).isNonCommand
}

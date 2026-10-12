/**
 * Server-side routing resolution — F10 authoritative routing.
 *
 * Trusts the client's already-resolved decision for ROUTING only (which branch
 * to take), re-checks risk server-side for every destructive action. The server
 * classifier is DEMOTED to the fallback path (omitted/low-confidence/malformed
 * clientRouting), not removed.
 */
import type { ClientRouting } from '../../shared/clientRouting.js'
import type { UserIntent } from '../../shared/intentTypes.js'
import type { AgentMode } from '../../shared/mode.js'
import { classifyMode } from './mode.js'
import { parseUserIntent as parseIntentWithKeyword } from './intentParser.js'
import { resolveIntent } from './intent.js'
import { config } from './config.js'

export interface ServerRouting {
  mode: AgentMode
  userIntent: UserIntent
  intent: ReturnType<typeof resolveIntent> // { message, actions }
  /** How the decision was reached — for logging and the clarify gate. */
  decidedBy: 'client' | 'server'
}

export function resolveServerRouting(
  userMessage: string,
  clientRouting: ClientRouting | undefined,
): ServerRouting {
  // Server always resolves its own template actions from the raw text — the
  // client never sends actions, and risk re-check (decision 3) depends on this.
  // resolveIntent re-classifies the raw text internally and builds act-template
  // actions only when ITS OWN classification is 'act', ignoring the claimed mode.
  const serverIntent = resolveIntent(userMessage)

  // TRUST the client decision for mode ROUTING when it is present AND confident.
  // Identical shared classifiers mean this is deduplication for honest clients;
  // the guard just prevents a stale/garbage field from steering the branch.
  const trustClient =
    clientRouting != null &&
    clientRouting.confidence >= config.intentConfidenceThreshold

  if (trustClient) {
    return {
      mode: clientRouting!.mode,
      // Keep a server-parsed UserIntent for the clarify gate's confidence read,
      // but stamp ONLY intentType/confidence/routingSource with the client's
      // values so the gate does not re-clarify something the client already
      // resolved confidently. Nothing downstream of the clarify gate consumes
      // these three client-stamped fields to build actions — actions come
      // solely from serverIntent (decision 3).
      userIntent: {
        ...parseIntentWithKeyword(userMessage),
        intentType: clientRouting!.intentType,
        confidence: clientRouting!.confidence,
        routingSource: clientRouting!.routingSource,
      },
      intent: serverIntent,
      decidedBy: 'client',
    }
  }

  // FALLBACK: omitted / low-confidence / malformed-then-stripped clientRouting.
  // Re-derive with the server classifier exactly as before F10.
  return {
    mode: classifyMode(userMessage),
    userIntent: parseIntentWithKeyword(userMessage),
    intent: serverIntent,
    decidedBy: 'server',
  }
}

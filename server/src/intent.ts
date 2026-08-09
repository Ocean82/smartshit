/**
 * Server-only intent resolution module.
 *
 * This file is NOT part of the client-side PipelineRouter.
 * It is used exclusively by server routes (server/src/index.ts) to:
 *   1. Resolve fast-path act-mode templates via resolveActTemplates
 *   2. Gate template creation behind classifyMode (prevent explain/advise from triggering actions)
 *   3. Detect weak LLM responses via isWeakResponse
 *
 * The client-side pipeline uses IntentClassifier stage (src/ai/pipeline/stages/intentClassifier.ts)
 * backed by shared/intentParser.ts instead.
 */
import type { AgentActionInput } from './prompt.js'
import { classifyMode, getHelpResponse } from './mode.js'
import { resolveActTemplates } from '../../shared/actTemplates.js'

export function resolveIntent(message: string): {
  message: string
  actions: AgentActionInput[]
} {
  const mode = classifyMode(message)

  if (mode === 'help') {
    return { message: getHelpResponse(), actions: [] }
  }

  if (mode !== 'act') {
    return { message: '', actions: [] }
  }

  return resolveActTemplates(message)
}

export function isWeakResponse(message: string, actions: AgentActionInput[]): boolean {
  const text = message.trim()
  if (actions.length > 0) return false
  if (!text || text === 'Done.' || text === 'Done') return true
  if (text.length < 12) return true
  return false
}

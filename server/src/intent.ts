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

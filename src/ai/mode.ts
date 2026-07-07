export type AgentMode = 'explain' | 'advise' | 'act' | 'help' | 'chat'

const HELP_PHRASES = [
  'what can you do',
  'how do i use',
  'what do you do',
]

function isHelpRequest(lower: string): boolean {
  if (lower === 'help' || lower.startsWith('help ')) return true
  return HELP_PHRASES.some((phrase) => lower.includes(phrase))
}

const EXPLAIN_SIGNALS = [
  'explain',
  'what does',
  'what do',
  'describe',
  'summarize',
  'summary',
  'analyze',
  'interpret',
  'tell me about',
  'what is',
  'what are',
  'how much',
  'why is',
  'why are',
  'what does this mean',
  'make sense of',
]

const ADVISE_SIGNALS = [
  'losing money',
  'lose money',
  'overspending',
  'overspend',
  'save money',
  'savings',
  'should i save',
  'how much should i save',
  'afford',
  'where can i cut',
  'cut back',
  'biggest expense',
  'spending too much',
  'financial advice',
  'money left',
  'left over',
]

const ACT_SIGNALS = [
  'create',
  'build',
  'make',
  'generate',
  'add a',
  'add an',
  'set up',
  'setup',
  'template',
  'track my',
  'track the',
]

function matchesAny(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal))
}

export function classifyMode(message: string): AgentMode {
  const lower = message.toLowerCase().trim()
  if (!lower) return 'chat'

  if (isHelpRequest(lower)) return 'help'
  if (matchesAny(lower, ADVISE_SIGNALS)) return 'advise'
  if (matchesAny(lower, EXPLAIN_SIGNALS)) return 'explain'
  if (matchesAny(lower, ACT_SIGNALS)) return 'act'

  const creationNouns = [
    'budget template',
    'monthly budget',
    'sales tracker',
    'invoice template',
    'project tracker',
    'employee roster',
  ]
  if (creationNouns.some((noun) => lower.includes(noun))) return 'act'

  if (
    lower.includes('budget')
    || lower.includes('invoice')
    || (lower.includes('track') && !lower.includes('?'))
  ) {
    if (
      lower.includes('create')
      || lower.includes('build')
      || lower.includes('make')
      || lower.includes('set up')
      || lower.includes('template')
    ) {
      return 'act'
    }
  }

  return 'chat'
}

export function isLlmOnlyMode(mode: AgentMode): boolean {
  return mode === 'explain' || mode === 'advise' || mode === 'chat'
}

const BUDGET_EXPLAIN_SIGNALS = [
  'expenses',
  'expense',
  'spending',
  'spend',
  'losing money',
  'lose money',
  'overspend',
  'over budget',
  'cashflow',
  'cash flow',
  'income',
  'budget',
  'financial',
  'where am i',
  'how much',
]

export function isBudgetExplainQuery(message: string): boolean {
  const lower = message.toLowerCase()
  return BUDGET_EXPLAIN_SIGNALS.some((signal) => lower.includes(signal))
}

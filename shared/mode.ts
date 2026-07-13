/**
 * Mode classification — shared between client and server.
 * Determines how a user message should be handled: explain, advise, act, help, or chat.
 */

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
  'what makes',
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
  'why these',
  'why those',
  'unusual',
  'outlier',
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
  'clear',
  'reset',
  'start over',
  'delete all',
  'remove all',
  'new budget',
  'new sheet',
  'sum ',
  'total ',
  'average ',
  'format ',
  'bold ',
  'chart',
  'graph',
]

function matchesAny(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal))
}

/** Question / analysis signals take priority over action keywords. */
export function classifyMode(message: string): AgentMode {
  const lower = message.toLowerCase().trim()
  if (!lower) return 'chat'

  if (isHelpRequest(lower)) return 'help'

  const hasAdvise = matchesAny(lower, ADVISE_SIGNALS)
  const hasExplain = matchesAny(lower, EXPLAIN_SIGNALS)
  const hasAct = matchesAny(lower, ACT_SIGNALS)

  if (hasAdvise) return 'advise'
  if (hasExplain) return 'explain'

  // Action keywords only win when no question/advice signals present
  if (hasAct) return 'act'

  // Domain nouns that imply creation when not asking a question
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

export function getHelpResponse(): string {
  return `I can help you:

**Understand your data**
- "Explain my expenses"
- "What does this sheet mean?"
- "Where am I losing money?"

**Build spreadsheets**
- "Build a monthly budget"
- "Create a sales tracker"
- "Make an invoice template"

**Work with your sheet**
- Add formulas (SUM, AVERAGE)
- Create charts
- Format cells

Import a file with the toolbar, then ask me to explain it or find overspending.`
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

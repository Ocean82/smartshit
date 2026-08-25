import type { ColumnRole, SheetProfile } from '@/ai/types'
import type { Selection } from '@/types'

export type GoalId = 'total' | 'by_category' | 'by_month'

export type GoalOutput = 'formula' | 'chart' | 'summary'

export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched'

export interface GoalDef {
  id: GoalId
  title: string
  requiredRoles: ColumnRole[]
  optionalRoles: ColumnRole[]
  outputs: GoalOutput[]
  defaultOutput: GoalOutput
}

export interface GoalSlots {
  amountColumn?: string
  categoryColumn?: string
  dateColumn?: string
  categoryValue?: string
}

export interface GoalMatch {
  status: MatchStatus
  goal?: GoalDef
  slots: GoalSlots
  output?: GoalOutput
  explain: string
  question?: string
  /** Follow-up chips that re-enter matchGoal as utterances. */
  chips?: string[]
}

export interface MatchGoalInput {
  profile?: SheetProfile | null
  selection?: Selection | null
  utterance?: string | null
}

export interface GoalAction {
  tool: string
  params: Record<string, unknown>
  description: string
}

export interface GoalExecution {
  actions: GoalAction[]
  message: string
  explain: string
}

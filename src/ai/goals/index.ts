export type {
  GoalAction,
  GoalDef,
  GoalExecution,
  GoalId,
  GoalMatch,
  GoalOutput,
  GoalSlots,
  MatchGoalInput,
  MatchStatus,
} from './types'
export { GOAL_REGISTRY, getGoalDef } from './registry'
export { matchGoal, rolesSatisfied } from './matchGoal'
export { executeGoal } from './executeGoal'
export { listSuggestedGoals } from './suggestGoals'
export { explainGoal } from './explain'

/**
 * Pipeline module — public exports.
 */

export { createPipelineRouter } from './router'
export type { PipelineRouterInstance } from './router'
export type {
  PipelineContext,
  PipelineStage,
  StageResult,
  StageAction,
  StageTiming,
} from './types'

// Stage factories
export {
  createGoalRouterStage,
  createAgentParserStage,
  createTemplateResolverStage,
  createIntentClassifierStage,
  createSemanticCapabilityRouterStage,
  createMacroPlannerStage,
  createDeterministicDispatcherStage,
  createLLMGatewayStage,
} from './stages'
export type {
  AgentParserDeps,
  GoalRouterDeps,
  TemplateResolverDeps,
  SemanticCapabilityRouterDeps,
} from './stages'

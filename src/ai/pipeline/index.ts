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
  createAgentParserStage,
  createTemplateResolverStage,
  createIntentClassifierStage,
  createMacroPlannerStage,
  createDeterministicDispatcherStage,
  createLLMGatewayStage,
} from './stages'
export type { AgentParserDeps, TemplateResolverDeps } from './stages'

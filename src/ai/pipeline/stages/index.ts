/**
 * Pipeline stages — public exports.
 */

export { createAgentParserStage } from './agentParser'
export type { AgentParserDeps } from './agentParser'

export { createTemplateResolverStage } from './templateResolver'
export type { TemplateResolverDeps } from './templateResolver'

export { createIntentClassifierStage } from './intentClassifier'

export { createDeterministicDispatcherStage } from './deterministicDispatcher'

export { createLLMGatewayStage } from './llmGateway'

/** @deprecated Prefer DeterministicDispatcher + LLMGateway. Kept for transitional tests. */
export { createBrainDispatcherStage } from './brainDispatcher'

# Intent System Unification — Migration Notes

## Summary

Replaced 6 competing intent/routing systems with a single ordered PipelineRouter.
The previous architecture had overlapping regex parsers, an unused NLP/WASM layer,
and ambiguous dispatch priority. The new architecture is explicit, debuggable,
and preserves all working behavior.

---

## What Was Deleted

| File | Reason | Replacement |
|------|--------|-------------|
| `src/ai/intentParser.ts` | Facade re-export with unused async path (`parseUserIntentAsync` never called from brain.ts). Added complexity with no value. | Direct imports from `shared/intentParser.ts` |
| `src/ai/intentParser.test.ts` | Tests for the deleted facade | Comprehensive tests exist in `shared/intentParser.test.ts` |
| `src/ai/__tests__/intentParserFacade.test.ts` | Tests for deleted async NLP routing | Deleted |
| `src/ai/nlp/nlpWorker.ts` | Always returned `unknown`; never produced useful results | Deleted — NLP deferred |
| `src/ai/nlp/nlpEngineClient.ts` | Client for the dead worker | Deleted |
| `src/ai/nlp/nlpEngineInit.ts` | Singleton management for unused engine | Deleted |
| `src/ai/nlp/hybridRouter.ts` | Confidence-based NLP/LLM/regex routing — complex but dormant | Deleted — routing logic now in pipeline stage order |
| `src/ai/nlp/modelManager.ts` | CDN model download/caching for unused NLP | Deleted |
| `src/ai/nlp/useNLPEngineInit.ts` | React hook to start dead NLP engine | Deleted |
| `src/ai/nlp/useNLPEngineState.ts` | React hook exposing NLP state to UI | Deleted |
| `src/ai/nlp/__tests__/hybridRouter.test.ts` | Tests for deleted hybrid router | Deleted |
| `src/ai/nlp/__tests__/nlpEngineClient.test.ts` | Tests for deleted client | Deleted |
| `src/ai/nlp/__tests__/modelManager.test.ts` | Tests for deleted model manager | Deleted |

**Why these were removed:** All of the above were dead code paths — either stubs that always returned `unknown`, facades to non-functional subsystems, or hooks/clients for an NLP engine that was never operational. They added maintenance burden and confused developers about which system actually handled user input. The PipelineRouter architecture makes these indirection layers unnecessary.

---

## What Was Kept (frozen for future use)

| File | Reason |
|------|--------|
| `server/src/intent.ts` | Server-only module, still used by server routes for act-mode template fast-path and weak-response detection. Not part of client pipeline. |
| `src/ai/nlp/intentClassifier.ts` | Working embedding-based classifier — frozen for future NLP pipeline stage |
| `src/ai/nlp/macroPlanner.ts` | Working multi-step decomposition logic — will become a pipeline stage when macro executor is wired |
| `src/ai/nlp/entityExtractor.ts` | Working entity extraction — useful for future NLP stage |
| `src/ai/nlp/types.ts` | Shared type definitions still referenced by kept modules |
| `src/ai/macro/macroExecutor.ts` | Correct transactional execution engine — awaiting real step executor implementation |

---

## What Was Simplified

| File | Change |
|------|--------|
| `src/ai/brain.ts` | Marked `@deprecated` as orchestrator. Its `processMessage()` and `runDeterministicSkills()` responsibilities moved to pipeline stages. Utility functions remain as shared helpers. `processMessage()` kept temporarily because `brainDispatcher.ts` still calls it. |
| `src/services/chatService.ts` | Was 200+ line if/else dispatch chain; now uses the unified PipelineRouter via `router.process()` |
| `src/App.tsx` | Removed `useNLPEngineInit()` call — engine did nothing useful |

---

## What Was Created

| File | Purpose |
|------|---------|
| `src/ai/pipeline/types.ts` | PipelineStage, PipelineContext, StageResult interfaces |
| `src/ai/pipeline/router.ts` | PipelineRouter — ordered stage execution with error isolation |
| `src/ai/pipeline/stages/agentParser.ts` | Stage 1: instant regex tool calls |
| `src/ai/pipeline/stages/templateResolver.ts` | Stage 2: gallery template matching |
| `src/ai/pipeline/stages/intentClassifier.ts` | Stage 3: context enrichment (never claims) |
| `src/ai/pipeline/stages/brainDispatcher.ts` | Stage 4: deterministic + LLM (always claims) |
| `src/ai/pipeline/stages/index.ts` | Barrel export for all stages |
| `src/ai/pipeline/__tests__/router.test.ts` | Unit tests for router |

---

## How to Add a New Pipeline Stage

1. Create a file in `src/ai/pipeline/stages/` (e.g., `myNewStage.ts`)
2. Implement the `PipelineStage` interface:
   ```typescript
   import { PipelineStage, PipelineContext, StageResult } from '../types'

   export function createMyNewStage(): PipelineStage {
     return {
       name: 'my-new-stage',
       async process(context: PipelineContext): Promise<StageResult | null> {
         // Return StageResult to claim the input, or null to pass
         return null
       }
     }
   }
   ```
3. Export the factory from `src/ai/pipeline/stages/index.ts`
4. Add to the stages array in `chatService.ts` at the desired priority position
5. Write tests in `src/ai/pipeline/__tests__/`

**Priority rules:**
- Earlier stages get first chance to claim input
- Stages that enrich context (like IntentClassifier) should return `null` and set `context` fields
- The terminal stage (currently brainDispatcher) should always claim — no input should fall through

---

## How to Re-enable NLP

When the NLP engine is ready for production:

1. Create a new pipeline stage: `src/ai/pipeline/stages/nlpClassifier.ts`
2. Have it use `src/ai/nlp/intentClassifier.ts` (the kept embedding classifier)
3. Insert it after `agentParser` and before `templateResolver` in the stages array
4. The stage should claim only when NLP confidence exceeds a threshold; return `null` otherwise
5. No facade or hybrid router needed — the pipeline itself IS the fallback chain

---

## How to Re-enable Macros

When macro execution is ready for production:

1. Create a MacroPlanner stage: `src/ai/pipeline/stages/macroPlanner.ts` implementing `PipelineStage`
2. Insert between IntentClassifier and BrainDispatcher (the documented extension point)
3. Wire `src/ai/macro/macroExecutor.ts` to real step implementations (replace the `defaultStepExecutor` stub with actual tool invocations)
4. Create a UI component for plan confirmation/rejection (users must approve multi-step plans before execution)
5. The stage claims multi-step commands; returns `null` for single-step
6. Once DeterministicDispatcher + LLMGateway stages are wired directly in the pipeline, remove the `brainDispatcher.ts` stage and the deprecated `processMessage()` in `brain.ts`

# Intent System Unification — Migration Notes

## Summary

Replaced 6 competing intent/routing systems with a single ordered PipelineRouter.
The previous architecture had overlapping regex parsers, an unused NLP/WASM layer,
and ambiguous dispatch priority. The new architecture is explicit, debuggable,
and preserves all working behavior.

## What Was Deleted

| File | Reason | Replacement |
|------|--------|-------------|
| `src/ai/nlp/nlpWorker.ts` | Always returned 'unknown'; never produced useful results | Deleted — NLP deferred |
| `src/ai/nlp/nlpEngineClient.ts` | Client for the dead worker | Deleted |
| `src/ai/nlp/nlpEngineInit.ts` | Singleton management for unused engine | Deleted |
| `src/ai/nlp/hybridRouter.ts` | Confidence-based NLP/LLM/regex routing — complex but dormant | Deleted — routing logic now in pipeline order |
| `src/ai/nlp/modelManager.ts` | CDN model download/caching for unused NLP | Deleted |
| `src/ai/nlp/useNLPEngineInit.ts` | React hook to start dead NLP engine | Deleted |
| `src/ai/nlp/useNLPEngineState.ts` | React hook exposing NLP state to UI | Deleted |
| `src/ai/__tests__/intentParserFacade.test.ts` | Tests for deleted async NLP routing | Deleted |
| `src/ai/nlp/__tests__/hybridRouter.test.ts` | Tests for deleted hybrid router | Deleted |
| `src/ai/nlp/__tests__/nlpEngineClient.test.ts` | Tests for deleted client | Deleted |
| `src/ai/nlp/__tests__/modelManager.test.ts` | Tests for deleted model manager | Deleted |

## What Was Kept (frozen for future use)

| File | Reason |
|------|--------|
| `src/ai/nlp/intentClassifier.ts` | Working embedding-based classifier — may be integrated as a pipeline stage in the future |
| `src/ai/nlp/macroPlanner.ts` | Working multi-step decomposition — will be a pipeline stage when macro executor is wired |
| `src/ai/nlp/entityExtractor.ts` | Working entity extraction — useful for future NLP stage |
| `src/ai/nlp/types.ts` | Shared type definitions still referenced by kept modules |
| `src/ai/macro/macroExecutor.ts` | Correct transactional execution engine — awaiting real step executor |

## What Was Simplified

| File | Change |
|------|--------|
| `src/ai/intentParser.ts` | Was 200+ line facade with NLP routing; now a thin re-export of `shared/intentParser.ts` |
| `src/services/chatService.ts` | Was 200+ line if/else dispatch chain; now creates pipeline and calls `router.process()` |
| `src/App.tsx` | Removed `useNLPEngineInit()` call — engine did nothing useful |

## What Was Created

| File | Purpose |
|------|---------|
| `src/ai/pipeline/types.ts` | PipelineStage, PipelineContext, StageResult interfaces |
| `src/ai/pipeline/router.ts` | PipelineRouter — ordered stage execution with error isolation |
| `src/ai/pipeline/stages/agentParser.ts` | Stage 1: instant regex tool calls |
| `src/ai/pipeline/stages/templateResolver.ts` | Stage 2: gallery template matching |
| `src/ai/pipeline/stages/intentClassifier.ts` | Stage 3: context enrichment (never claims) |
| `src/ai/pipeline/stages/brainDispatcher.ts` | Stage 4: deterministic + LLM (always claims) |
| `src/ai/pipeline/__tests__/router.test.ts` | 9 unit tests for router |

## How to Add New Pipeline Stages

1. Create a file in `src/ai/pipeline/stages/`
2. Implement the `PipelineStage` interface: `{ name: string; process(ctx): Promise<StageResult | null> }`
3. Return `StageResult` to claim, or `null` to pass
4. Add it to the stages array in `chatService.ts` at the desired priority position
5. Export from `src/ai/pipeline/stages/index.ts`

## How to Re-enable NLP

When the NLP engine is ready for production:

1. Create a new pipeline stage `src/ai/pipeline/stages/nlpClassifier.ts`
2. Have it use `src/ai/nlp/intentClassifier.ts` (the kept embedding classifier)
3. Insert it after `agentParser` and before `templateResolver` in the pipeline
4. The stage would claim only when confidence is high; pass otherwise
5. No facade or hybrid router needed — the pipeline IS the fallback chain

## How to Re-enable Macros

When macro execution is ready:

1. Wire a real `stepExecutor` in `src/ai/macro/macroExecutor.ts` (replace the stub)
2. Create `src/ai/pipeline/stages/macroPlanner.ts`
3. Insert between IntentClassifier and BrainDispatcher (the marked extension point)
4. The stage claims multi-step commands; passes single-step

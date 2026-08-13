/**
 * Pipeline Router — Single entry point for user message processing.
 *
 * Executes stages in fixed priority order. The first stage to return a
 * non-null StageResult wins — subsequent stages are not executed.
 *
 * Stage errors are caught and logged; the pipeline continues to the next stage.
 * If no stage claims the input, a fallback result is returned.
 */

import type { PipelineContext, PipelineStage, StageResult, StageTiming } from './types'

// ─── Router Interface ───────────────────────────────────────────────────────

export interface PipelineRouterInstance {
  /** Process a user message through all pipeline stages */
  process(context: PipelineContext): Promise<StageResult>
  /** Get timing data from the last process() call (for diagnostics) */
  getLastTimings(): StageTiming[]
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates a pipeline router that processes stages in order.
 *
 * @param stages - Ordered array of pipeline stages (priority = array order)
 * @returns A router instance with process() and diagnostics
 */
export function createPipelineRouter(stages: PipelineStage[]): PipelineRouterInstance {
  let lastTimings: StageTiming[] = []

  return {
    async process(context: PipelineContext): Promise<StageResult> {
      const timings: StageTiming[] = []

      for (const stage of stages) {
        const start = performance.now()
        let result: StageResult | null = null

        try {
          result = await stage.process(context)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[pipeline] Stage "${stage.name}" threw:`, message)
          // Stage failed — skip to next, don't crash the pipeline
        }

        const durationMs = Math.round((performance.now() - start) * 100) / 100
        const claimed = result !== null

        timings.push({ stageName: stage.name, durationMs, claimed })

        if (claimed) {
          lastTimings = timings

          if (process.env.NODE_ENV === 'development') {
            console.info(
              `[pipeline] "${stage.name}" claimed in ${durationMs}ms`,
              timings.map((t) => `${t.stageName}: ${t.durationMs}ms${t.claimed ? ' ✓' : ''}`),
            )
          }

          return result!
        }
      }

      // No stage claimed — this should only happen if LLMGateway (terminal) also fails
      lastTimings = timings
      console.warn(
        '[pipeline] No stage claimed the input:',
        context.message.slice(0, 80),
        timings.map((t) => `${t.stageName}: ${t.durationMs}ms`),
      )

      return {
        success: false,
        message: "I wasn't able to process that request. Could you try rephrasing?",
        stageName: 'pipeline-fallback',
      }
    },

    getLastTimings(): StageTiming[] {
      return lastTimings
    },
  }
}

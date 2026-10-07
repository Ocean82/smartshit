/**
 * TemplateResolver Stage — Instant gallery template matching (no LLM).
 *
 * Wraps the existing promptRouter.ts resolveGalleryTemplate() function.
 * When a user says "Create a monthly budget" or "Build a sales tracker",
 * this stage matches it against the template database. On an empty sheet it
 * executes instantly; on a sheet with data it returns the template as a
 * pending action so the user approves the overwrite first.
 *
 * Claims when: template match found
 * Passes when: no match
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { ExecutionContext } from '@/agent/executor'
import { resolveGalleryTemplate, executeTemplateTool } from '@/templates'

export interface TemplateResolverDeps {
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  pushHistory: (desc: string) => void
}

export function createTemplateResolverStage(deps: TemplateResolverDeps): PipelineStage {
  return {
    name: 'template-resolver',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const match = resolveGalleryTemplate(context.message)
      if (!match) return null

      const sheetHasData = Object.values(context.sheet.cells).some(
        (cell) => cell?.value != null || cell?.formula,
      )
      if (sheetHasData) {
        return {
          success: true,
          message: `This sheet already has data. Building the ${match.label} template will write over existing cells. Review it below before applying.`,
          actions: [{ tool: match.tool, params: {}, description: `Build ${match.label} template` }],
          stageName: 'template-resolver',
          metadata: { toolUsed: match.tool, templateName: match.name, needsApproval: true },
        }
      }

      deps.pushHistory(`Template: ${match.label}`)
      const execCtx = deps.buildExecContext({ suppressHistory: true })
      const result = executeTemplateTool(match.tool, {}, execCtx)

      const message = result.success
        ? `✓ ${result.message}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} filled)` : ''}`
        : `⚠️ ${result.message}`

      return {
        success: result.success,
        message,
        stageName: 'template-resolver',
        metadata: {
          toolUsed: match.tool,
          templateName: match.name,
          modified: result.modified,
        },
      }
    },
  }
}

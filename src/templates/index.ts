/**
 * Template module — single entry point for all create_* template tools.
 *
 * Data templates live as declarative TemplateSpec objects in the category
 * files (core.ts, personal-finance.ts, ...) and are applied by applyTemplate.
 * Tools with real logic (create_chart, clean_sheet_data) live in handlers.ts.
 */
import type { ExecutionContext, ExecutionResult } from '@/agent/executor';
import { TEMPLATE_SPECS } from './registry';
import { applyTemplate } from './apply';
import { createChart, cleanSheetData } from './handlers';

export { TEMPLATE_SPECS, ALL_TEMPLATE_SPECS } from './registry';
export { applyTemplate } from './apply';
export { resolveGalleryTemplate } from './promptRouter';
export type { GalleryTemplateMatch } from './promptRouter';
export type { TemplateSpec, TemplateCellSpec, TemplateFormatSpec } from './types';

/** True when `tool` is a declarative data template that can run instantly. */
export function hasTemplateSpec(tool: string): boolean {
  return tool in TEMPLATE_SPECS;
}

/** Execute any template tool (data spec or code handler). */
export function executeTemplateTool(
  tool: string,
  params: Record<string, unknown>,
  ctx: ExecutionContext,
): ExecutionResult {
  const spec = TEMPLATE_SPECS[tool];
  if (spec) return applyTemplate(spec, ctx);

  switch (tool) {
    case 'create_chart':
      return createChart(params, ctx);
    case 'clean_sheet_data':
      return cleanSheetData(params, ctx);
    case 'analyze_data':
      // Read-only — the analysis itself is in the assistant message
      return { success: true, message: 'Analysis is included in the response', modified: 0 };
    default:
      return { success: false, message: `Unknown template tool: ${tool}`, modified: 0 };
  }
}

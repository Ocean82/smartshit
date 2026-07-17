import type { ExecutionContext, ExecutionResult } from '@/agent/executor';
import type { TemplateSpec } from './types';

/** Apply a declarative template spec to the sheet via the execution context. */
export function applyTemplate(spec: TemplateSpec, ctx: ExecutionContext): ExecutionResult {
  ctx.bulkSetCells(spec.cells);
  for (const step of spec.formats) {
    for (const id of step.ids) {
      ctx.setCellFormat(id, step.format);
    }
  }
  return {
    success: true,
    message: `Built ${spec.label}`,
    modified: Object.keys(spec.cells).length,
  };
}

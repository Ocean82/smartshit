/**
 * Template tools with real logic (params, charts, cleaning) — everything else
 * in this module is declarative data applied by applyTemplate().
 */
import { v4 as uuid } from 'uuid';
import type { ChartConfig } from '@/types';
import type { ExecutionContext, ExecutionResult } from '@/agent/executor';
import { applyCleaningChanges, previewCleaning, type CleaningPreview } from '@/ai/analysis/cleaning';

export function createChart(params: Record<string, unknown>, ctx: ExecutionContext): ExecutionResult {
  if (!ctx.addChart) {
    return { success: false, message: 'Charts are not available in this context', modified: 0 };
  }
  const chartType = (params.type as string) || 'bar';
  ctx.addChart({
    id: uuid(),
    type: chartType as ChartConfig['type'],
    title: 'Data Chart',
    dataRange: 'A1:B10',
    position: { x: 50, y: 50, width: 400, height: 300 },
    colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
  });
  return { success: true, message: `Created ${chartType} chart`, modified: 0 };
}

export function cleanSheetData(params: Record<string, unknown>, ctx: ExecutionContext): ExecutionResult {
  const preview = params.preview as CleaningPreview | undefined;
  const cleaning = preview ?? previewCleaning(ctx.getActiveSheet());
  const { cellUpdates, rowsToDelete } = applyCleaningChanges(ctx.getActiveSheet(), cleaning);
  ctx.bulkSetCells(cellUpdates);
  for (const row of rowsToDelete) {
    ctx.deleteRow(row);
  }
  return {
    success: true,
    message: 'Cleaned sheet data',
    modified: Object.keys(cellUpdates).length + rowsToDelete.length,
  };
}

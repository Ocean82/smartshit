import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@/agent/executor';
import type { CellFormat } from '@/types';
import { ALL_TEMPLATE_SPECS, TEMPLATE_SPECS, executeTemplateTool, hasTemplateSpec } from './index';
import { templates as galleryTemplates } from '@/data/templates';
import { TEMPLATE_TOOL_NAMES } from '@shared/toolRegistry';

// The spec files were generated from (and verified byte-for-byte against) the
// old executeTemplateAction switch in useStore.ts before it was deleted.

type Op =
  | { op: 'bulk'; cells: Record<string, { value: string | number | boolean | null; formula?: string }> }
  | { op: 'fmt'; id: string; format: Partial<CellFormat> };

function makeRecorder() {
  const ops: Op[] = [];
  const ctx = {
    bulkSetCells: (cells: Op extends { cells: infer C } ? C : never) => ops.push({ op: 'bulk', cells }),
    setCellFormat: (id: string, format: Partial<CellFormat>) => ops.push({ op: 'fmt', id, format }),
  } as unknown as ExecutionContext;
  return { ops, ctx };
}

describe('template registry', () => {
  it('contains 55 data templates with unique tool names', () => {
    expect(ALL_TEMPLATE_SPECS.length).toBe(55);
    expect(Object.keys(TEMPLATE_SPECS).length).toBe(55);
  });

  it('every spec has cells and a label', () => {
    for (const spec of ALL_TEMPLATE_SPECS) {
      expect(Object.keys(spec.cells).length, spec.tool).toBeGreaterThan(0);
      expect(spec.label.length, spec.tool).toBeGreaterThan(0);
    }
  });

  it('per-template structure summary (regression snapshot)', () => {
    const summary = Object.fromEntries(
      ALL_TEMPLATE_SPECS.map((s) => [
        s.tool,
        {
          cells: Object.keys(s.cells).length,
          formatSteps: s.formats.length,
          formattedCells: s.formats.reduce((n, f) => n + f.ids.length, 0),
        },
      ]),
    );
    expect(summary).toMatchSnapshot();
  });

  it('every spec tool is registered in shared TEMPLATE_TOOL_NAMES', () => {
    for (const spec of ALL_TEMPLATE_SPECS) {
      expect(TEMPLATE_TOOL_NAMES, spec.tool).toContain(spec.tool);
    }
  });

  it('every gallery template tool resolves to a spec or handler', () => {
    const handlers = new Set(['create_chart', 'clean_sheet_data', 'analyze_data']);
    for (const t of galleryTemplates) {
      for (const tool of t.tools) {
        expect(hasTemplateSpec(tool) || handlers.has(tool), `${t.id}: ${tool}`).toBe(true);
      }
    }
  });

  it('executeTemplateTool fails cleanly for unknown tools', () => {
    const { ctx } = makeRecorder();
    const result = executeTemplateTool('create_nonexistent', {}, ctx);
    expect(result.success).toBe(false);
    expect(result.modified).toBe(0);
  });
});

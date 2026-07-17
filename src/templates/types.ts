import type { CellFormat } from '@/types';

/** A single cell's content within a template. */
export interface TemplateCellSpec {
  value: string | number | boolean | null;
  formula?: string;
}

/** One formatting step: apply `format` to each cell id, in order. */
export interface TemplateFormatSpec {
  ids: string[];
  format: Partial<CellFormat>;
}

/**
 * Declarative spreadsheet template: static cell contents plus an ordered
 * list of formatting steps (later steps override earlier ones for the same
 * cell, matching sequential setCellFormat behavior).
 */
export interface TemplateSpec {
  /** Tool name, e.g. "create_wedding_budget". */
  tool: string;
  /** Human-readable label used in confirmation messages, e.g. "wedding budget". */
  label: string;
  cells: Record<string, TemplateCellSpec>;
  formats: TemplateFormatSpec[];
}

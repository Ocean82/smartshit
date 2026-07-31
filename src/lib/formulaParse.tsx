/**
 * Formula Parsing Utilities
 *
 * Consolidated formula parsing logic extracted from:
 * - FormulaAutocomplete (extractActiveToken)
 * - InspectorPanelContent (precedent/dependent extraction)
 * - FormulaBar (name box parsing)
 * - ChartRenderer (series range parsing)
 * - aiFunctionDefinitions (AI function argument splitting)
 */

import { tryCellToRef, refToCell, letterToCol } from './cellRef';
import type { ReactNode } from 'react';

export interface CellRef {
  row: number;
  col: number;
}

export interface RangeRef {
  start: CellRef;
  end: CellRef;
}

/** Check if a token looks like a cell reference (A1, BC23, etc.) */
export function isCellReference(token: string): boolean {
  return /^[A-Z]{1,3}\d{1,7}$/i.test(token);
}

/** Check if a token looks like a range reference (A1:B10) */
export function isRangeReference(token: string): boolean {
  return /^[A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7}$/i.test(token);
}

/** Parse a cell reference string into row/col (0-based). Returns null if invalid. */
export function parseCellReference(ref: string): CellRef | null {
  return tryCellToRef(ref.toUpperCase());
}

/** Parse a range reference (A1:B10) into start/end CellRefs. Returns null if invalid. */
export function parseRangeReference(range: string): RangeRef | null {
  const parts = range.split(':');
  if (parts.length !== 2) return null;

  const start = tryCellToRef(parts[0].toUpperCase());
  const end = tryCellToRef(parts[1].toUpperCase());

  if (!start || !end) return null;

  return {
    start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
    end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
  };
}

/** Expand a range into an array of cell reference strings (A1, A2, B1, B2...) */
export function expandRange(range: string): string[] {
  const parsed = parseRangeReference(range);
  if (!parsed) return [];

  const { start, end } = parsed;
  const result: string[] = [];

  for (let r = start.row; r <= end.row; r++) {
    for (let c = start.col; c <= end.col; c++) {
      result.push(refToCell(r, c));
    }
  }
  return result;
}

/**
 * Extract the active function token being typed in a formula.
 * E.g., "=SUM(A1)+IF(" → "IF"
 * Returns null if not in a function name context.
 */
export function extractActiveToken(formula: string): string | null {
  if (!formula.startsWith('=')) return null;

  // Strip leading '=' and find the last token that looks like a function name
  // Function names: start with letter, contain letters/digits/underscores/dots
  // Preceded by: = ( + - * / , & < > space
  const expr = formula.slice(1);
  const match = expr.match(/(?:^|[=(+\-*/,&<> ])([A-Z_][A-Z_0-9.]*)$/i);

  if (!match) return null;
  const token = match[1].toUpperCase();
  return token.length > 0 ? token : null;
}

/**
 * Parse all cell references from a formula (both individual and ranges).
 * Returns unique cell refs expanded from ranges.
 */
export function parseCellReferences(formula: string): string[] {
  const refs = new Set<string>();

  // First, find and expand range references (A1:B10)
  const rangeRe = /([A-Z]{1,3}\d{1,7}):([A-Z]{1,3}\d{1,7})/gi;
  let match: RegExpExecArray | null;

  while ((match = rangeRe.exec(formula)) !== null) {
    const expanded = expandRange(`${match[1]}:${match[2]}`);
    expanded.forEach(ref => refs.add(ref));
  }

  // Then find individual cell references not already covered by ranges
  // Temporarily replace ranges so we don't double-match
  const cleanedFormula = formula.replace(/[A-Z]{1,3}\d{1,7}:[A-Z]{1,3}\d{1,7}/gi, '');
  const cellRe = /([A-Z]{1,3}\d{1,7})/gi;

  while ((match = cellRe.exec(cleanedFormula)) !== null) {
    refs.add(match[1].toUpperCase());
  }

  return Array.from(refs);
}

/**
 * Parse all range references from a formula.
 * Returns array of { start, end } CellRefs.
 */
export function parseRangeReferences(formula: string): RangeRef[] {
  const ranges: RangeRef[] = [];
  const rangeRe = /([A-Z]{1,3}\d{1,7}):([A-Z]{1,3}\d{1,7})/gi;
  let match: RegExpExecArray | null;

  while ((match = rangeRe.exec(formula)) !== null) {
    const parsed = parseRangeReference(`${match[1]}:${match[2]}`);
    if (parsed) ranges.push(parsed);
  }

  return ranges;
}

/**
 * Parse a name box input (e.g., "A1" or "B10") into a CellRef.
 * Returns null if invalid.
 */
export function parseNameBoxInput(input: string): CellRef | null {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  // Match A1, BC23, etc.
  const match = trimmed.match(/^([A-Z]{1,3})(\d{1,7})$/);
  if (!match) return null;

  const col = letterToCol(match[1]);
  const row = parseInt(match[2], 10) - 1;

  if (row < 0) return null;
  return { row, col };
}

/**
 * Split AI function arguments by comma, respecting quoted strings.
 * E.g., 'arg1, "arg,2", arg3' → ['arg1', '"arg,2"', 'arg3']
 */
export function splitAIArguments(argsStr: string): string[] {
  if (!argsStr.trim()) return [];

  // Split by comma not inside quotes
  return argsStr
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(a => a.trim());
}

/**
 * Resolve an argument string to a value:
 * - Quoted string → string content
 * - Number → number
 * - Cell reference → resolved via callback
 * - Range reference → 2D array via callback
 * - Other → string
 */
export function resolveAIArgument(
  arg: string,
  resolveRef: (ref: string) => string | number | boolean | null,
  resolveRange: (range: string) => (string | number | boolean | null)[][]
): string | number | boolean | null | (string | number | boolean | null)[][] {
  // String literal
  if (arg.startsWith('"') && arg.endsWith('"')) {
    return arg.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(arg)) {
    return Number(arg);
  }

  // Cell reference
  if (isCellReference(arg)) {
    return resolveRef(arg.toUpperCase());
  }

  // Range reference
  if (isRangeReference(arg)) {
    return resolveRange(arg.toUpperCase());
  }

  // Pass through as string
  return arg;
}

/**
 * Score a function name against a typed token for autocomplete ranking.
 * 0 = exact match (excluded), 1 = prefix match, 2 = substring match, -1 = no match
 */
export function scoreFunctionMatch(name: string, token: string): number {
  const upperName = name.toUpperCase();
  const upperToken = token.toUpperCase();

  if (upperName === upperToken) return 0; // Exact — already complete
  if (upperName.startsWith(upperToken)) return 1; // Prefix
  if (upperName.includes(upperToken)) return 2; // Substring
  return -1;
}

/**
 * Highlight the matching portion of a function name for display.
 * Returns React nodes with <strong> around the match.
 */
export function highlightMatch(name: string, token: string): ReactNode {
  if (!token) return name;
  const idx = name.toUpperCase().indexOf(token.toUpperCase());
  if (idx === -1) return name;

  return (
    <>
      {name.slice(0, idx)}
      <strong>{name.slice(idx, idx + token.length)}</strong>
      {name.slice(idx + token.length)}
    </>
  );
}

/** Escape a string for use in a RegExp */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get the column letter for a 0-based column index.
 * Re-export from spreadsheet engine for convenience.
 */
export { colToLetter, letterToCol, refToCell, cellToRef, tryCellToRef } from './cellRef';
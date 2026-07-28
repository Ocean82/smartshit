import { Workbook, type WorkbookApi } from '@ocean8219/formualizer';
import type { SheetData, WorkbookData, PivotConfig, PivotResult } from '@/types';
import { v4 as uuid } from 'uuid';
import { AIFunctionRegistry } from './aiFunctions';
import { registerBuiltinAIFunctions, getAIFunctionList } from './aiFunctionDefinitions';
import { computePivotTable } from './pivot';

export function colToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode(65 + (c % 26)) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

export function letterToCol(letter: string): number {
  const upper = letter.toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1;
}

const CELL_ID_RE = /^([A-Za-z]{1,3})(\d{1,7})$/;

/**
 * Parse a cell id ("A1", "bc23") into 0-based coordinates, or `null` when the
 * input is not a valid reference.
 *
 * Prefer this over `cellToRef` wherever a malformed id should be handled
 * explicitly — `cellToRef` collapses bad input to A1, which silently writes to
 * the wrong cell.
 */
export function tryCellToRef(cellId: string): { row: number; col: number } | null {
  const match = typeof cellId === 'string' ? cellId.match(CELL_ID_RE) : null;
  if (!match) return null;
  const row = parseInt(match[2], 10) - 1;
  if (row < 0) return null;
  return { row, col: letterToCol(match[1]) };
}

/**
 * Parse a cell id into 0-based coordinates, falling back to A1 for malformed
 * input. Retained for the many call sites that cannot meaningfully handle a
 * failure; new code should use {@link tryCellToRef}.
 */
export function cellToRef(cellId: string): { row: number; col: number } {
  return tryCellToRef(cellId) ?? { row: 0, col: 0 };
}

export function refToCell(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

/**
 * Convert a raw formualizer cell value into the display string used everywhere
 * in the app (grid, auditor, AI context).
 *
 * Formualizer returns Excel error strings directly (e.g. "#DIV/0!", "#REF!"),
 * so we just need to handle null/undefined and coerce everything else to string.
 */
export function computedValueToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val !== null) {
    const detailed = val as { value?: unknown; type?: string };
    // formualizer errors have { value: '#DIV/0!', type: 'DIV_BY_ZERO' }
    if (typeof detailed.value === 'string' && detailed.value.startsWith('#')) {
      return detailed.value;
    }
    return '#ERROR!';
  }
  return String(val);
}

export function createEmptySheet(name: string): SheetData {
  return {
    id: uuid(),
    name,
    cells: {},
    columnWidths: {},
    rowHeights: {},
    charts: [],
  };
}

export function createEmptyWorkbook(name: string): WorkbookData {
  const sheet = createEmptySheet('Sheet 1');
  return {
    id: uuid(),
    name,
    sheets: [sheet],
    activeSheetId: sheet.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export class SpreadsheetEngine {
  private wb: WorkbookApi;
  // Maps our internal sheet uuid -> the sheet name used in formualizer
  private sheetMapping: Map<string, string> = new Map();
  private readonly _aiRegistry: AIFunctionRegistry;
  private _disposeAIFunctions: (() => void) | null = null;

  /**
   * @param aiRegistry Optional registry override. Defaults to a registry owned
   * by this engine so that disposing one engine cannot unregister the AI
   * functions still in use by another instance (tests, preview panes, a second
   * workbook tab). Pass the shared `aiFunctionRegistry` explicitly to opt into
   * the previous global behaviour.
   */
  constructor(aiRegistry?: AIFunctionRegistry) {
    this._aiRegistry = aiRegistry ?? new AIFunctionRegistry();
    this.wb = new Workbook();
    this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
    this.invalidateFunctionMap(); // Ensure AI functions appear in function map
  }

  /** Access the AI function registry for custom function registration */
  get aiRegistry(): AIFunctionRegistry {
    return this._aiRegistry;
  }

  loadWorkbook(workbook: WorkbookData): void {
    this.reset();
    for (const sheet of workbook.sheets) {
      this.loadSheet(sheet);
    }
  }

  loadSheet(sheet: SheetData): { success: boolean; error?: Error } {
    try {
      const sheetName = this.uniqueSheetName(sheet.name);
      this.wb.addSheet(sheetName);
      this.sheetMapping.set(sheet.id, sheetName);

      for (const [cellId, cellData] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId);
        // row/col are 0-based internally; formualizer uses 1-based
        const r = ref.row + 1;
        const c = ref.col + 1;
        if (cellData.formula && this.isAIFormula(cellData.formula)) {
          // AI formulas bypass the engine — store the cached value
          const v = cellData.value;
          if (v !== null && v !== undefined) this.wb.setValue(sheetName, r, c, v as string | number | boolean);
        } else if (cellData.formula) {
          this.wb.setFormula(sheetName, r, c, cellData.formula);
        } else if (cellData.value !== null && cellData.value !== undefined) {
          this.wb.setValue(sheetName, r, c, cellData.value as string | number | boolean);
        }
      }
      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[engine] Failed to load sheet "${sheet.name}":`, error);
      return { success: false, error };
    }
  }

  /** Suffix a sheet name until it no longer collides inside formualizer. */
  private uniqueSheetName(name: string): string {
    const base = name.trim() || 'Sheet';
    const existing = new Set(this.sheetMapping.values());
    if (!existing.has(base)) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base} (${i})`;
      if (!existing.has(candidate)) return candidate;
    }
    return `${base} (${Date.now()})`;
  }

  getCellValue(sheetId: string, row: number, col: number): unknown {
    const sheetName = this.sheetMapping.get(sheetId);
    if (!sheetName) return null;
    try {
      return this.wb.evaluateCell(sheetName, row + 1, col + 1);
    } catch {
      return null;
    }
  }

  setCellValue(sheetId: string, row: number, col: number, value: string | number | boolean | null): void {
    const sheetName = this.sheetMapping.get(sheetId);
    if (!sheetName) return;
    try {
      if (value === null) {
        this.wb.setValue(sheetName, row + 1, col + 1, '');
      } else if (typeof value === 'string' && value.startsWith('=')) {
        this.wb.setFormula(sheetName, row + 1, col + 1, value);
      } else {
        this.wb.setValue(sheetName, row + 1, col + 1, value);
      }
    } catch (e) {
      console.error('Error setting cell value:', e);
    }
  }

  getComputedValue(sheetId: string, row: number, col: number): string {
    const val = this.getCellValue(sheetId, row, col);
    return computedValueToString(val);
  }

  /**
   * Execute an AI formula function for a specific cell.
   * Called when a cell contains a formula starting with =AI.
   *
   * @param cellId The cell reference (e.g., "A1")
   * @param formulaText The full formula text (e.g., "=AI.CATEGORIZE(A1)")
   * @param resolveArg Callback to resolve cell references to values
   * @returns The AI function result (immediate or placeholder)
   */
  executeAIFormula(
    cellId: string,
    formulaText: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): string | number | boolean | null {
    // Parse: =AI.FUNCTION_NAME(arg1, arg2, ...)
    const match = formulaText.match(/^=(AI\.[A-Z0-9_-]+)\((.*)?\)$/i);
    if (!match) return '#NAME?';

    const funcName = match[1].toUpperCase();
    const argsStr = match[2] || '';

    if (!this._aiRegistry.has(funcName)) return '#NAME?';

    // Parse arguments (simple: split by comma, resolve cell refs)
    const rawArgs = argsStr
      ? argsStr.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((a) => a.trim())
      : [];

    const resolvedArgs = rawArgs.map((arg): string | number | boolean | null | (string | number | boolean | null)[][] => {
      // String literal
      if (arg.startsWith('"') && arg.endsWith('"')) {
        return arg.slice(1, -1);
      }
      // Number
      if (/^-?\d+(\.\d+)?$/.test(arg)) {
        return Number(arg);
      }
      // Cell reference — resolve it
      if (/^[A-Z]+\d+$/i.test(arg)) {
        return resolveArg(arg);
      }
      // Range reference (A1:B10) — resolve to 2D array
      if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(arg)) {
        const rangeResult = this._resolveRange(arg, resolveArg);
        // Check for ref error marker
        const firstCell = rangeResult[0]?.[0];
        if (firstCell && typeof firstCell === 'object' && '__refError' in firstCell) {
          return '#REF!';
        }
        // TypeScript narrowing: after the check, rangeResult is the normal type
        return rangeResult as (string | number | boolean | null)[][];
      }
      // Pass as string
      return arg;
    });

    return this._aiRegistry.execute(funcName, cellId, resolvedArgs);
  }

  /** Check if a formula is an AI function */
  isAIFormula(formula: string): boolean {
    return /^=AI\.[A-Z0-9_-]+\(/i.test(formula);
  }

  /**
   * Execute all AI formulas in the workbook.
   * Placeholder for future use - currently store handles per-sheet execution.
   */
  executeAllAIFormulas(): void {
    // Implementation would require access to store's cell data
    // For now, store calls executeAIFormulasForSheet per sheet
  }

  /**
   * Execute AI formulas for a specific sheet by scanning the store's cell data.
   * This should be called from the store after loading workbook data.
   */
  executeAIFormulasForSheet(
    sheetId: string,
    cells: Record<string, { value: string | number | boolean | null; formula?: string }>,
    resolveArg: (ref: string) => string | number | boolean | null
  ): void {
    const sheetName = this.sheetMapping.get(sheetId);
    if (!sheetName) return;

    for (const [cellId, cellData] of Object.entries(cells)) {
      if (cellData.formula && this.isAIFormula(cellData.formula)) {
        // Fire and forget - registry handles caching/dedup
        this.executeAIFormula(cellId, cellData.formula, resolveArg);
      }
    }
  }

private _resolveRange(
    rangeRef: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): (string | number | boolean | null | { __refError: true })[][] {
    const parts = rangeRef.split(':');
    if (parts.length !== 2) return [];

    const start = tryCellToRef(parts[0].toUpperCase());
    const end = tryCellToRef(parts[1].toUpperCase());

    if (!start || !end) {
      // Return a special marker that executeAIFormula can detect and convert to #REF!
      return [[{ __refError: true }]] as (string | number | boolean | null | { __refError: true })[][];
    }

    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);

    const result: (string | number | boolean | null)[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: (string | number | boolean | null)[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        row.push(resolveArg(refToCell(r, c)));
      }
      result.push(row);
    }
    return result;
  }

  getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }> {
    return [...this.getFallbackFunctions(), ...this.getExtendedFunctions(), ...getAIFunctionList(this._aiRegistry)];
  }

  private _functionMap: Map<string, { description: string; category: string; syntax: string }> | null = null;
  private buildFunctionMap() {
    if (this._functionMap) return this._functionMap;
    const m = new Map<string, { description: string; category: string; syntax: string }>();
    for (const fn of [...this.getFallbackFunctions(), ...this.getExtendedFunctions()]) {
      m.set(fn.name, { description: fn.description, category: fn.category, syntax: fn.syntax });
    }
    this._functionMap = m;
    return m;
  }

  /**
   * Invalidate the function map cache so it rebuilds on next getFunctionInfo call.
   * Call this after dynamically registering new functions.
   */
  invalidateFunctionMap(): void {
    this._functionMap = null;
  }

  getFunctionInfo(name: string): { name: string; description: string; category: string; syntax: string } | null {
    const key = name.toUpperCase();
    // Check the memoized built-in map first — getFunctionList() rebuilds the
    // full catalogue on every call, which is far too slow for a per-keystroke
    // autocomplete lookup.
    const info = this.buildFunctionMap().get(key);
    if (info) return { name: key, ...info };

    const aiInfo = this._aiRegistry.getFunctionInfo(key);
    if (aiInfo) {
      return {
        name: aiInfo.name,
        description: aiInfo.abstract,
        category: aiInfo.category,
        syntax: aiInfo.syntax,
      };
    }
    return null;
  }

  private getFallbackFunctions(): Array<{ name: string; description: string; category: string; syntax: string }> {
    return [
      { name: 'SUM', description: 'Adds its arguments', category: 'Math', syntax: 'SUM(number1, [number2], ...)' },
      { name: 'AVERAGE', description: 'Returns the average of its arguments', category: 'Statistical', syntax: 'AVERAGE(number1, [number2], ...)' },
      { name: 'COUNT', description: 'Counts how many numbers are in the list of arguments', category: 'Statistical', syntax: 'COUNT(value1, [value2], ...)' },
      { name: 'COUNTA', description: 'Counts how many values are in the list of arguments', category: 'Statistical', syntax: 'COUNTA(value1, [value2], ...)' },
      { name: 'MAX', description: 'Returns the largest value', category: 'Statistical', syntax: 'MAX(number1, [number2], ...)' },
      { name: 'MIN', description: 'Returns the smallest value', category: 'Statistical', syntax: 'MIN(number1, [number2], ...)' },
      { name: 'IF', description: 'Specifies a logical test to perform', category: 'Logical', syntax: 'IF(condition, true_value, [false_value])' },
      { name: 'AND', description: 'Returns TRUE if all arguments are TRUE', category: 'Logical', syntax: 'AND(logical1, [logical2], ...)' },
      { name: 'OR', description: 'Returns TRUE if any argument is TRUE', category: 'Logical', syntax: 'OR(logical1, [logical2], ...)' },
      { name: 'NOT', description: 'Reverses the logical value', category: 'Logical', syntax: 'NOT(logical)' },
      { name: 'CONCATENATE', description: 'Joins several text strings into one', category: 'Text', syntax: 'CONCATENATE(text1, [text2], ...)' },
      { name: 'LEFT', description: 'Returns the leftmost characters', category: 'Text', syntax: 'LEFT(text, [num_chars])' },
      { name: 'RIGHT', description: 'Returns the rightmost characters', category: 'Text', syntax: 'RIGHT(text, [num_chars])' },
      { name: 'MID', description: 'Returns a specific number of characters from a text string', category: 'Text', syntax: 'MID(text, start_num, num_chars)' },
      { name: 'LEN', description: 'Returns the number of characters', category: 'Text', syntax: 'LEN(text)' },
      { name: 'TRIM', description: 'Removes spaces from text', category: 'Text', syntax: 'TRIM(text)' },
      { name: 'UPPER', description: 'Converts text to uppercase', category: 'Text', syntax: 'UPPER(text)' },
      { name: 'LOWER', description: 'Converts text to lowercase', category: 'Text', syntax: 'LOWER(text)' },
      { name: 'VLOOKUP', description: 'Looks for a value in the leftmost column', category: 'Lookup', syntax: 'VLOOKUP(lookup_value, table_array, col_index, [range_lookup])' },
      { name: 'HLOOKUP', description: 'Looks for a value in the top row', category: 'Lookup', syntax: 'HLOOKUP(lookup_value, table_array, row_index, [range_lookup])' },
      { name: 'INDEX', description: 'Returns a value from a position', category: 'Lookup', syntax: 'INDEX(array, row_num, [column_num])' },
      { name: 'MATCH', description: 'Returns an item position in a range', category: 'Lookup', syntax: 'MATCH(lookup_value, lookup_array, [match_type])' },
      { name: 'SUMIF', description: 'Adds cells that meet a condition', category: 'Math', syntax: 'SUMIF(range, criteria, [sum_range])' },
      { name: 'COUNTIF', description: 'Counts cells that meet a condition', category: 'Statistical', syntax: 'COUNTIF(range, criteria)' },
      { name: 'ROUND', description: 'Rounds a number to specified digits', category: 'Math', syntax: 'ROUND(number, num_digits)' },
      { name: 'ABS', description: 'Returns the absolute value', category: 'Math', syntax: 'ABS(number)' },
      { name: 'CEILING', description: 'Rounds up to nearest multiple', category: 'Math', syntax: 'CEILING(number, significance)' },
      { name: 'FLOOR', description: 'Rounds down to nearest multiple', category: 'Math', syntax: 'FLOOR(number, significance)' },
      { name: 'NOW', description: 'Returns current date and time', category: 'Date/Time', syntax: 'NOW()' },
      { name: 'TODAY', description: 'Returns current date', category: 'Date/Time', syntax: 'TODAY()' },
      { name: 'DATE', description: 'Creates a date from year, month, day', category: 'Date/Time', syntax: 'DATE(year, month, day)' },
      { name: 'YEAR', description: 'Returns the year from a date', category: 'Date/Time', syntax: 'YEAR(serial_number)' },
      { name: 'MONTH', description: 'Returns the month from a date', category: 'Date/Time', syntax: 'MONTH(serial_number)' },
      { name: 'DAY', description: 'Returns the day from a date', category: 'Date/Time', syntax: 'DAY(serial_number)' },
      { name: 'ROWS', description: 'Returns the number of rows', category: 'Lookup', syntax: 'ROWS(array)' },
      { name: 'COLUMNS', description: 'Returns the number of columns', category: 'Lookup', syntax: 'COLUMNS(array)' },
      { name: 'PI', description: 'Returns the value of pi', category: 'Math', syntax: 'PI()' },
      { name: 'POWER', description: 'Returns a number raised to a power', category: 'Math', syntax: 'POWER(number, power)' },
      { name: 'SQRT', description: 'Returns a positive square root', category: 'Math', syntax: 'SQRT(number)' },
      { name: 'MOD', description: 'Returns the remainder after division', category: 'Math', syntax: 'MOD(number, divisor)' },
      { name: 'INT', description: 'Rounds down to nearest integer', category: 'Math', syntax: 'INT(number)' },
      { name: 'AVERAGEIF', description: 'Returns average of cells meeting criteria', category: 'Statistical', syntax: 'AVERAGEIF(range, criteria, [average_range])' },
      { name: 'SUMPRODUCT', description: 'Returns sum of products', category: 'Math', syntax: 'SUMPRODUCT(array1, [array2], ...)' },
    ];
  }

  private getExtendedFunctions(): Array<{ name: string; description: string; category: string; syntax: string }> {
    return [
      // Lookup & Reference (from PhpSpreadsheet reference)
      { name: 'XLOOKUP', description: 'Searches a range or array for a match', category: 'Lookup', syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, [not_found], [match_mode])' },
      { name: 'FILTER', description: 'Filters a range based on criteria', category: 'Lookup', syntax: 'FILTER(array, include, [if_empty])' },
      { name: 'SORT', description: 'Sorts the contents of a range', category: 'Lookup', syntax: 'SORT(array, [sort_index], [sort_order], [by_col])' },
      { name: 'UNIQUE', description: 'Returns unique values from a range', category: 'Lookup', syntax: 'UNIQUE(array, [by_col], [exactly_once])' },
      { name: 'INDIRECT', description: 'Returns reference specified by a text string', category: 'Lookup', syntax: 'INDIRECT(ref_text, [a1])' },
      { name: 'OFFSET', description: 'Returns a reference offset from a starting point', category: 'Lookup', syntax: 'OFFSET(reference, rows, cols, [height], [width])' },
      { name: 'ADDRESS', description: 'Returns a cell address as text', category: 'Lookup', syntax: 'ADDRESS(row_num, column_num, [abs_num], [a1], [sheet_text])' },
      { name: 'TRANSPOSE', description: 'Returns the transpose of an array', category: 'Lookup', syntax: 'TRANSPOSE(array)' },
      { name: 'CHOOSE', description: 'Chooses a value from a list', category: 'Lookup', syntax: 'CHOOSE(index_num, value1, [value2], ...)' },
      // Statistical
      { name: 'COUNTBLANK', description: 'Counts empty cells in a range', category: 'Statistical', syntax: 'COUNTBLANK(range)' },
      { name: 'COUNTIFS', description: 'Counts cells meeting multiple criteria', category: 'Statistical', syntax: 'COUNTIFS(range1, criteria1, [range2], [criteria2], ...)' },
      { name: 'SUMIFS', description: 'Sums cells meeting multiple criteria', category: 'Math', syntax: 'SUMIFS(sum_range, range1, criteria1, [range2], [criteria2], ...)' },
      { name: 'AVERAGEIFS', description: 'Average of cells meeting multiple criteria', category: 'Statistical', syntax: 'AVERAGEIFS(avg_range, range1, criteria1, [range2], [criteria2], ...)' },
      { name: 'MEDIAN', description: 'Returns the median of given numbers', category: 'Statistical', syntax: 'MEDIAN(number1, [number2], ...)' },
      { name: 'MODE', description: 'Returns the most common value', category: 'Statistical', syntax: 'MODE(number1, [number2], ...)' },
      { name: 'STDEV', description: 'Estimates standard deviation', category: 'Statistical', syntax: 'STDEV(number1, [number2], ...)' },
      { name: 'VAR', description: 'Estimates variance', category: 'Statistical', syntax: 'VAR(number1, [number2], ...)' },
      { name: 'LARGE', description: 'Returns the k-th largest value', category: 'Statistical', syntax: 'LARGE(array, k)' },
      { name: 'SMALL', description: 'Returns the k-th smallest value', category: 'Statistical', syntax: 'SMALL(array, k)' },
      { name: 'RANK', description: 'Returns the rank of a number in a list', category: 'Statistical', syntax: 'RANK(number, ref, [order])' },
      { name: 'PERCENTILE', description: 'Returns the k-th percentile', category: 'Statistical', syntax: 'PERCENTILE(array, k)' },
      // Math & Trig
      { name: 'PRODUCT', description: 'Multiplies its arguments', category: 'Math', syntax: 'PRODUCT(number1, [number2], ...)' },
      { name: 'RAND', description: 'Returns a random number between 0 and 1', category: 'Math', syntax: 'RAND()' },
      { name: 'RANDBETWEEN', description: 'Returns a random integer between two values', category: 'Math', syntax: 'RANDBETWEEN(bottom, top)' },
      { name: 'LOG', description: 'Returns the logarithm of a number', category: 'Math', syntax: 'LOG(number, [base])' },
      { name: 'LOG10', description: 'Returns the base-10 logarithm', category: 'Math', syntax: 'LOG10(number)' },
      { name: 'EXP', description: 'Returns e raised to a power', category: 'Math', syntax: 'EXP(number)' },
      { name: 'SIGN', description: 'Returns the sign of a number', category: 'Math', syntax: 'SIGN(number)' },
      { name: 'TRUNC', description: 'Truncates a number to an integer', category: 'Math', syntax: 'TRUNC(number, [num_digits])' },
      { name: 'EVEN', description: 'Rounds up to nearest even integer', category: 'Math', syntax: 'EVEN(number)' },
      { name: 'ODD', description: 'Rounds up to nearest odd integer', category: 'Math', syntax: 'ODD(number)' },
      { name: 'GCD', description: 'Returns the greatest common divisor', category: 'Math', syntax: 'GCD(number1, [number2], ...)' },
      { name: 'LCM', description: 'Returns the least common multiple', category: 'Math', syntax: 'LCM(number1, [number2], ...)' },
      // Logical
      { name: 'IFS', description: 'Checks multiple conditions', category: 'Logical', syntax: 'IFS(condition1, value1, [condition2], [value2], ...)' },
      { name: 'SWITCH', description: 'Evaluates expression against values', category: 'Logical', syntax: 'SWITCH(expression, value1, result1, [value2, result2], ..., [default])' },
      { name: 'IFERROR', description: 'Returns value if no error, otherwise alternative', category: 'Logical', syntax: 'IFERROR(value, value_if_error)' },
      { name: 'IFNA', description: 'Returns value if not #N/A, otherwise alternative', category: 'Logical', syntax: 'IFNA(value, value_if_na)' },
      { name: 'XOR', description: 'Returns TRUE if odd number of args are TRUE', category: 'Logical', syntax: 'XOR(logical1, [logical2], ...)' },
      // Text
      { name: 'TEXT', description: 'Formats a number as text', category: 'Text', syntax: 'TEXT(value, format_text)' },
      { name: 'VALUE', description: 'Converts text to number', category: 'Text', syntax: 'VALUE(text)' },
      { name: 'SUBSTITUTE', description: 'Replaces text in a string', category: 'Text', syntax: 'SUBSTITUTE(text, old_text, new_text, [instance_num])' },
      { name: 'FIND', description: 'Finds text within another (case-sensitive)', category: 'Text', syntax: 'FIND(find_text, within_text, [start_num])' },
      { name: 'SEARCH', description: 'Finds text within another (case-insensitive)', category: 'Text', syntax: 'SEARCH(find_text, within_text, [start_num])' },
      { name: 'REPLACE', description: 'Replaces characters within text', category: 'Text', syntax: 'REPLACE(old_text, start_num, num_chars, new_text)' },
      { name: 'REPT', description: 'Repeats text a given number of times', category: 'Text', syntax: 'REPT(text, number_times)' },
      { name: 'PROPER', description: 'Capitalizes first letter of each word', category: 'Text', syntax: 'PROPER(text)' },
      { name: 'EXACT', description: 'Checks if two text strings are identical', category: 'Text', syntax: 'EXACT(text1, text2)' },
      { name: 'TEXTJOIN', description: 'Joins text with a delimiter', category: 'Text', syntax: 'TEXTJOIN(delimiter, ignore_empty, text1, [text2], ...)' },
      // Date/Time
      { name: 'DATEDIF', description: 'Calculates difference between two dates', category: 'Date/Time', syntax: 'DATEDIF(start_date, end_date, unit)' },
      { name: 'EDATE', description: 'Returns date N months away', category: 'Date/Time', syntax: 'EDATE(start_date, months)' },
      { name: 'EOMONTH', description: 'Returns last day of month N months away', category: 'Date/Time', syntax: 'EOMONTH(start_date, months)' },
      { name: 'WEEKDAY', description: 'Returns the day of the week', category: 'Date/Time', syntax: 'WEEKDAY(serial_number, [return_type])' },
      { name: 'WEEKNUM', description: 'Returns the week number', category: 'Date/Time', syntax: 'WEEKNUM(serial_number, [return_type])' },
      { name: 'NETWORKDAYS', description: 'Returns number of whole working days', category: 'Date/Time', syntax: 'NETWORKDAYS(start_date, end_date, [holidays])' },
      { name: 'HOUR', description: 'Returns the hour from a time', category: 'Date/Time', syntax: 'HOUR(serial_number)' },
      { name: 'MINUTE', description: 'Returns the minute from a time', category: 'Date/Time', syntax: 'MINUTE(serial_number)' },
      { name: 'SECOND', description: 'Returns the second from a time', category: 'Date/Time', syntax: 'SECOND(serial_number)' },
      // Financial (from PhpSpreadsheet reference)
      { name: 'PMT', description: 'Returns the payment for a loan', category: 'Financial', syntax: 'PMT(rate, nper, pv, [fv], [type])' },
      { name: 'FV', description: 'Returns the future value of an investment', category: 'Financial', syntax: 'FV(rate, nper, pmt, [pv], [type])' },
      { name: 'PV', description: 'Returns the present value of an investment', category: 'Financial', syntax: 'PV(rate, nper, pmt, [fv], [type])' },
      { name: 'NPV', description: 'Returns the net present value', category: 'Financial', syntax: 'NPV(rate, value1, [value2], ...)' },
      { name: 'IRR', description: 'Returns the internal rate of return', category: 'Financial', syntax: 'IRR(values, [guess])' },
      { name: 'RATE', description: 'Returns the interest rate per period', category: 'Financial', syntax: 'RATE(nper, pmt, pv, [fv], [type], [guess])' },
      { name: 'NPER', description: 'Returns the number of periods', category: 'Financial', syntax: 'NPER(rate, pmt, pv, [fv], [type])' },
      // Information
      { name: 'ISBLANK', description: 'Returns TRUE if value is empty', category: 'Information', syntax: 'ISBLANK(value)' },
      { name: 'ISNUMBER', description: 'Returns TRUE if value is a number', category: 'Information', syntax: 'ISNUMBER(value)' },
      { name: 'ISTEXT', description: 'Returns TRUE if value is text', category: 'Information', syntax: 'ISTEXT(value)' },
      { name: 'ISERROR', description: 'Returns TRUE if value is an error', category: 'Information', syntax: 'ISERROR(value)' },
      { name: 'ISNA', description: 'Returns TRUE if value is #N/A', category: 'Information', syntax: 'ISNA(value)' },
      { name: 'TYPE', description: 'Returns the type of value', category: 'Information', syntax: 'TYPE(value)' },
    ];
  }

  computePivotTable(
    cells: Record<string, { value: string | number | boolean | null }>,
    config: PivotConfig,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number
  ): PivotResult {
    return computePivotTable(cells, config, startRow, endRow, startCol, endCol);
  }

  /**
   * Reset the engine for a new workbook.
   * Clears AI cache, pending calls, and rebuilds the formualizer workbook.
   * Called by loadWorkbook to ensure clean state when switching workbooks.
   */
  reset(): void {
    // Clear AI registry cache and pending calls
    this._aiRegistry.clearCache();
    // Note: pending calls will complete but update callback may target old cells
    // This is acceptable as they'll be ignored (sheetMapping cleared below)
    
    // Recreate formualizer workbook and clear sheet mapping
    this.wb = new Workbook();
    this.sheetMapping.clear();
    
    // Invalidate function map cache so it rebuilds with current AI functions
    this._functionMap = null;
  }

  destroy(): void {
    if (this._disposeAIFunctions) {
      this._disposeAIFunctions();
      this._disposeAIFunctions = null;
    }
    this._aiRegistry.dispose();
    // formualizer WASM objects are GC'd; no explicit destroy needed
  }
}

import { Workbook, type WorkbookApi, parse, FormulaDialect, ASTNodeData } from '@ocean8219/formualizer';
import type { SheetData, WorkbookData, PivotConfig, PivotResult } from '@/types';
import { v4 as uuid } from 'uuid';
import { AIFunctionRegistry, type EvalValue } from './aiFunctions';
import { registerBuiltinAIFunctions, getAIFunctionList } from './aiFunctionDefinitions';
import { computePivotTable } from './pivot';

import { colToLetter, letterToCol, tryCellToRef, cellToRef, refToCell } from '@/lib/cellRef';
export { colToLetter, letterToCol, tryCellToRef, cellToRef, refToCell };

export function computedValueToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val !== null) {
    const detailed = val as { value?: unknown; type?: string };
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
  private sheetMapping: Map<string, string> = new Map();
  private _aiRegistry: AIFunctionRegistry;
  private _disposeAIFunctions: (() => void) | null = null;

  constructor(aiRegistry?: AIFunctionRegistry) {
    this._aiRegistry = aiRegistry ?? new AIFunctionRegistry();
    this.wb = new Workbook();
    this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
    this.invalidateFunctionMap();
  }

  get aiRegistry(): AIFunctionRegistry {
    return this._aiRegistry;
  }

  loadWorkbook(workbook: WorkbookData): void {
    this.reset();
    for (const sheet of workbook.sheets) {
      this.loadSheet(sheet);
    }
  }

  reset(): void {
    this._aiRegistry.clearCache();
    this._aiRegistry.dispose();
    this._disposeAIFunctions?.();
    this._aiRegistry = new AIFunctionRegistry();
    this.wb = new Workbook();
    this.sheetMapping.clear();
    this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
    this.invalidateFunctionMap();
  }

  loadSheet(sheet: SheetData): { success: boolean; error?: Error } {
    try {
      const sheetName = this.uniqueSheetName(sheet.name);
      this.wb.addSheet(sheetName);
      this.sheetMapping.set(sheet.id, sheetName);

      for (const [cellId, cellData] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId);
        const r = ref.row + 1;
        const c = ref.col + 1;
        if (cellData.formula && this.isAIFormula(cellData.formula)) {
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

  async executeAIFormula(
    cellId: string,
    formulaText: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): Promise<string | number | boolean | null> {
    const useFormualizer = typeof FormulaDialect !== 'undefined' && typeof parse === 'function';

    let funcName!: string;
    const resolvedArgs: EvalValue[] = [];

    if (useFormualizer) {
      let ast: ASTNodeData | null;
      try {
        ast = await parse(formulaText, FormulaDialect.Excel);
      } catch (e) {
        console.error('[AI Formula] Parse error:', e);
        return '#NAME?';
      }

      if (!ast || ast.type !== 'function' || !ast.name) return '#NAME?';
      funcName = ast.name.toUpperCase();
      if (!this._aiRegistry.has(funcName)) return '#NAME?';

      if (ast.args && ast.args.length > 0) {
        for (const argNode of ast.args) {
          if (!argNode) continue;
          const resolved = await this._resolveAIArgument(argNode as ASTNodeData, resolveArg);
          resolvedArgs.push(resolved);
        }
      }
    } else {
      const match = formulaText.match(/^=(AI\.[A-Z0-9_-]+)\((.*)\)$/i);
      if (!match) return '#NAME?';
      funcName = match[1].toUpperCase();
      if (!this._aiRegistry.has(funcName)) return '#NAME?';

      const rawArgs = match[2];
      if (rawArgs.trim()) {
        const args = this._splitArgs(rawArgs);
        for (const arg of args) {
          const trimmed = arg.trim();
          if (
            (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))
          ) {
            resolvedArgs.push(trimmed.slice(1, -1));
          } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            resolvedArgs.push(Number(trimmed));
          } else if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(trimmed)) {
            const rangeResult = this._resolveRange(trimmed, resolveArg);
            const firstCell = rangeResult[0]?.[0];
            if (firstCell && typeof firstCell === 'object' && '__refError' in firstCell) {
              resolvedArgs.push('#REF!');
            } else {
              resolvedArgs.push(rangeResult);
            }
          } else if (/^[A-Z]+\d+$/i.test(trimmed)) {
            resolvedArgs.push(resolveArg(trimmed));
          } else {
            resolvedArgs.push(trimmed);
          }
        }
      }
    }

    return this._aiRegistry.execute(funcName, cellId, resolvedArgs);
  }

  isAIFormula(formula: string): boolean {
    return /^=AI\.[A-Z0-9_-]+\(/i.test(formula);
  }

  executeAllAIFormulas(): void {
  }

  executeAIFormulasForSheet(
    sheetId: string,
    cells: Record<string, { value: string | number | boolean | null; formula?: string }>,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): void {
    const sheetName = this.sheetMapping.get(sheetId);
    if (!sheetName) return;

    for (const [cellId, cellData] of Object.entries(cells)) {
      if (cellData.formula && this.isAIFormula(cellData.formula)) {
        void this.executeAIFormula(cellId, cellData.formula, resolveArg);
      }
    }
  }

  /**
   * Convert an AST node to its string representation for simple cases.
   * Used to handle simple literals and references in AI function arguments.
   */
  private astNodeToString(node: ASTNodeData): string {
    if (!node) return '';
    switch (node.type) {
      case 'text':
        return `"${node.value ?? ''}"`;
      case 'number':
        return String(node.value ?? 0);
      case 'boolean':
        return String(node.value ?? false);
      case 'reference': {
        const ref = node.reference;
        if (!ref) return '';
        const start = `${colToLetter(ref.colStart)}${ref.rowStart + 1}`;
        if (ref.rowStart === ref.rowEnd && ref.colStart === ref.colEnd) {
          return start;
        }
        const end = `${colToLetter(ref.colEnd)}${ref.rowEnd + 1}`;
        return `${start}:${end}`;
      }
      case 'function': {
        const args = (node.args ?? []).map((arg) => this.astNodeToString(arg)).join(', ');
        return `${node.name}(${args})`;
      }
      case 'binaryOp':
        return `(${this.astNodeToString(node.left!)}${node.op}${this.astNodeToString(node.right!)})`;
      case 'unaryOp':
        return `${node.op}${this.astNodeToString(node.operand!)}`;
      default:
        return '';
    }
  }

  private async _resolveAIArgument(
    argNode: ASTNodeData,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): Promise<EvalValue> {
    // Convert AST node to string for simple cases
    const argStr = this.astNodeToString(argNode);
    const trimmed = argStr.trim();

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(trimmed)) {
      const rangeResult = this._resolveRange(trimmed, resolveArg);
      const firstCell = rangeResult[0]?.[0];
      if (firstCell && typeof firstCell === 'object' && '__refError' in firstCell) {
        return '#REF!';
      }
      return rangeResult;
    }

    if (/^[A-Z]+\d+$/i.test(trimmed)) {
      return resolveArg(trimmed);
    }

    try {
      const ast = await parse(trimmed, FormulaDialect.Excel);
      return this._evaluateAST(ast, resolveArg);
    } catch {
      return trimmed;
    }
  }

  private async _evaluateAST(
    ast: ASTNodeData,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): Promise<EvalValue> {
    if (!ast) return null;

    switch (ast.type) {
      case 'reference': {
        const ref = ast.reference;
        if (!ref) return null;
        if (
          ref.rowStart === ref.rowEnd &&
          ref.colStart === ref.colEnd &&
          ref.rowStart !== undefined
        ) {
          const cellRef = `${colToLetter(ref.colStart)}${ref.rowStart + 1}`;
          return resolveArg(cellRef);
        }
        return this._resolveRange(
          `${colToLetter(ref.colStart)}${ref.rowStart + 1}:${colToLetter(ref.colEnd)}${ref.rowEnd + 1}`,
          resolveArg,
        );
      }
      case 'number':
        return ast.value ?? 0;
      case 'text':
        return ast.value ?? '';
      case 'boolean':
        return ast.value ?? false;
      case 'binaryOp': {
        const leftNode = ast.left;
        const rightNode = ast.right;
        if (!leftNode || !rightNode) return null;
        const left = await this._evaluateAST(leftNode, resolveArg);
        const right = await this._evaluateAST(rightNode, resolveArg);
        if (left === null || right === null) return null;
        const op = ast.op;
        if (typeof left === 'number' && typeof right === 'number') {
          switch (op) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return right !== 0 ? left / right : '#DIV/0!';
            case '^': return Math.pow(left, right);
            case '&': return String(left) + String(right);
            case '=': return left === right;
            case '<>': return left !== right;
            case '<': return left < right;
            case '<=': return left <= right;
            case '>': return left > right;
            case '>=': return left >= right;
          }
        }
        if (op === '&') return String(left) + String(right);
        if (op === '=') return left === right;
        if (op === '<>') return left !== right;
        if (op === '<') return left < right;
        if (op === '<=') return left <= right;
        if (op === '>') return left > right;
        if (op === '>=') return left >= right;
        return null;
      }
      case 'unaryOp': {
        const operandNode = ast.operand;
        if (!operandNode) return null;
        const operand = await this._evaluateAST(operandNode, resolveArg);
        if (operand === null) return null;
        if (ast.op === '-' && typeof operand === 'number') return -operand;
        if (ast.op === '+' && typeof operand === 'number') return +operand;
        return operand;
      }
case 'function': {
        const funcName = ast.name?.toUpperCase();
        const args = await Promise.all(
          (ast.args ?? []).map((arg: ASTNodeData) => this._evaluateAST(arg, resolveArg)),
        );
        return funcName ? this._evaluateFunction(funcName, args) : null;
      }
      default:
        return null;
    }
  }

  private _evaluateFunction(funcName: string, _args: EvalValue[]): string | number | boolean | null {
    return `#FUNC:${funcName}`;
  }
  private _splitArgs(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (inString) {
        current += ch;
        if (ch === stringChar && argsStr[i - 1] !== '\\') {
          inString = false;
        }
      } else if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        current += ch;
      } else if (ch === ',') {
        args.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) args.push(current);
    return args;
  }

  private _resolveRange(
    rangeRef: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): EvalValue[][] {
    const parts = rangeRef.split(':');
    if (parts.length !== 2) return [];

    const start = tryCellToRef(parts[0].toUpperCase());
    const end = tryCellToRef(parts[1].toUpperCase());

    if (!start || !end) {
      return [[{ __refError: true }]];
    }

    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);

    const result: EvalValue[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: EvalValue[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        row.push(resolveArg(refToCell(r, c)));
      }
      result.push(row);
    }
    return result;
  }

  getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }> {
    let formualizerFunctions: Array<{ name: string; description: string; category: string; syntax: string }> = [];
    try {
      const registered = this.wb.listFunctions();
      formualizerFunctions = registered.map(fn => ({
        name: fn.name,
        description: `Built-in function (${fn.minArgs}–${fn.maxArgs ?? '∞'} args)${fn.volatile ? ' [volatile]' : ''}`,
        category: 'Formulas',
        syntax: `${fn.name}(${Array.from({ length: fn.minArgs }, (_, i) => `arg${i + 1}`).join(', ')}${fn.maxArgs === null || fn.maxArgs > fn.minArgs ? ', ...' : ''})`,
      }));
    } catch { /* formualizer unavailable */ }

    const fallback = [...this.getFallbackFunctions(), ...this.getExtendedFunctions()];
    const aiFunctions = getAIFunctionList(this._aiRegistry);

    const seen = new Set<string>();
    const merged: Array<{ name: string; description: string; category: string; syntax: string }> = [];

    for (const fn of [...formualizerFunctions, ...fallback, ...aiFunctions]) {
      const key = fn.name.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(fn);
      }
    }
    return merged;
  }

  private _functionMap: Map<string, { description: string; category: string; syntax: string }> | null = null;
  private buildFunctionMap() {
    if (this._functionMap) return this._functionMap;
    const m = new Map<string, { description: string; category: string; syntax: string }>();
    for (const fn of [...this.getFallbackFunctions(), ...this.getExtendedFunctions()]) {
      m.set(fn.name, { description: fn.description, category: fn.category, syntax: fn.syntax });
    }
    try {
      const formualizerFuncs = this.wb.listFunctions();
      for (const fn of formualizerFuncs) {
        const name = fn.name.toUpperCase();
        if (!m.has(name)) {
          m.set(name, {
            description: `Formualizer built-in: ${fn.name}`,
            category: 'Formualizer',
            syntax: `${fn.name}(${fn.minArgs === fn.maxArgs ? fn.minArgs : `${fn.minArgs}–${fn.maxArgs ?? '?'}`} args)`,
          });
        }
      }
    } catch { /* formualizer unavailable */ }
    this._functionMap = m;
    return m;
  }

  invalidateFunctionMap(): void {
    this._functionMap = null;
  }

  getFunctionInfo(name: string): { name: string; description: string; category: string; syntax: string } | null {
    const key = name.toUpperCase();
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
      { name: 'XLOOKUP', description: 'Searches a range or array for a match', category: 'Lookup', syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, [not_found], [match_mode])' },
      { name: 'FILTER', description: 'Filters a range based on criteria', category: 'Lookup', syntax: 'FILTER(array, include, [if_empty])' },
      { name: 'SORT', description: 'Sorts the contents of a range', category: 'Lookup', syntax: 'SORT(array, [sort_index], [sort_order], [by_col])' },
      { name: 'UNIQUE', description: 'Returns unique values from a range', category: 'Lookup', syntax: 'UNIQUE(array, [by_col], [exactly_once])' },
      { name: 'INDIRECT', description: 'Returns reference specified by a text string', category: 'Lookup', syntax: 'INDIRECT(ref_text, [a1])' },
      { name: 'OFFSET', description: 'Returns a reference offset from a starting point', category: 'Lookup', syntax: 'OFFSET(reference, rows, cols, [height], [width])' },
      { name: 'ADDRESS', description: 'Returns a cell address as text', category: 'Lookup', syntax: 'ADDRESS(row_num, column_num, [abs_num], [a1], [sheet_text])' },
      { name: 'TRANSPOSE', description: 'Returns the transpose of an array', category: 'Lookup', syntax: 'TRANSPOSE(array)' },
      { name: 'CHOOSE', description: 'Chooses a value from a list', category: 'Lookup', syntax: 'CHOOSE(index_num, value1, [value2], ...)' },
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
      { name: 'IFS', description: 'Checks multiple conditions', category: 'Logical', syntax: 'IFS(condition1, value1, [condition2], [value2], ...)' },
      { name: 'SWITCH', description: 'Evaluates expression against values', category: 'Logical', syntax: 'SWITCH(expression, value1, result1, [value2, result2], ..., [default])' },
      { name: 'IFERROR', description: 'Returns value if no error, otherwise alternative', category: 'Logical', syntax: 'IFERROR(value, value_if_error)' },
      { name: 'IFNA', description: 'Returns value if not #N/A, otherwise alternative', category: 'Logical', syntax: 'IFNA(value, value_if_na)' },
      { name: 'XOR', description: 'Returns TRUE if odd number of args are TRUE', category: 'Logical', syntax: 'XOR(logical1, [logical2], ...)' },
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
      { name: 'DATEDIF', description: 'Calculates difference between two dates', category: 'Date/Time', syntax: 'DATEDIF(start_date, end_date, unit)' },
      { name: 'EDATE', description: 'Returns date N months away', category: 'Date/Time', syntax: 'EDATE(start_date, months)' },
      { name: 'EOMONTH', description: 'Returns last day of month N months away', category: 'Date/Time', syntax: 'EOMONTH(start_date, months)' },
      { name: 'WEEKDAY', description: 'Returns the day of the week', category: 'Date/Time', syntax: 'WEEKDAY(serial_number, [return_type])' },
      { name: 'WEEKNUM', description: 'Returns the week number', category: 'Date/Time', syntax: 'WEEKNUM(serial_number, [return_type])' },
      { name: 'NETWORKDAYS', description: 'Returns number of whole working days', category: 'Date/Time', syntax: 'NETWORKDAYS(start_date, end_date, [holidays])' },
      { name: 'HOUR', description: 'Returns the hour from a time', category: 'Date/Time', syntax: 'HOUR(serial_number)' },
      { name: 'MINUTE', description: 'Returns the minute from a time', category: 'Date/Time', syntax: 'MINUTE(serial_number)' },
      { name: 'SECOND', description: 'Returns the second from a time', category: 'Date/Time', syntax: 'SECOND(serial_number)' },
      { name: 'PMT', description: 'Returns the payment for a loan', category: 'Financial', syntax: 'PMT(rate, nper, pv, [fv], [type])' },
      { name: 'FV', description: 'Returns the future value of an investment', category: 'Financial', syntax: 'FV(rate, nper, pmt, [pv], [type])' },
      { name: 'PV', description: 'Returns the present value of an investment', category: 'Financial', syntax: 'PV(rate, nper, pmt, [pv], [type])' },
      { name: 'NPV', description: 'Returns the net present value', category: 'Financial', syntax: 'NPV(rate, value1, [value2], ...)' },
      { name: 'IRR', description: 'Returns the internal rate of return', category: 'Financial', syntax: 'IRR(values, [guess])' },
      { name: 'RATE', description: 'Returns the interest rate per period', category: 'Financial', syntax: 'RATE(nper, pmt, pv, [fv], [type], [guess])' },
      { name: 'NPER', description: 'Returns the number of periods', category: 'Financial', syntax: 'NPER(rate, pmt, pv, [fv], [type])' },
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

  destroy(): void {
    if (this._disposeAIFunctions) {
      this._disposeAIFunctions();
      this._disposeAIFunctions = null;
    }
    this._aiRegistry.dispose();
  }
}
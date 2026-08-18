import { Workbook, type WorkbookApi, parse, FormulaDialect, ASTNodeData } from '@ocean8219/formualizer';
import type { SheetData, WorkbookData, PivotConfig, PivotResult } from '@/types';
import { v4 as uuid } from 'uuid';
import { AIFunctionRegistry, type EvalValue } from './aiFunctions';
import { registerBuiltinAIFunctions, getAIFunctionList } from './aiFunctionDefinitions';
import { computePivotTable } from './pivot';
import { initializeOnnxFunction, type OnnxInitOptions } from '@/onnx/onnxInit';
import { CORE_FUNCTIONS, EXTENDED_FUNCTIONS, mergeFunctionSources, type FunctionInfo } from './functionCatalog';

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
  private _disposeOnnxFunction: (() => void) | null = null;
  private _onnxInitOptions: OnnxInitOptions | undefined;

  constructor(aiRegistry?: AIFunctionRegistry, onnxInitOptions?: OnnxInitOptions) {
    this._aiRegistry = aiRegistry ?? new AIFunctionRegistry();
    this._onnxInitOptions = onnxInitOptions;
    this.wb = new Workbook();
    this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
    this._disposeOnnxFunction = initializeOnnxFunction(this._aiRegistry, this._onnxInitOptions);
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
    this._disposeOnnxFunction?.();
    this._aiRegistry = new AIFunctionRegistry();
    this.wb = new Workbook();
    this.sheetMapping.clear();
    this._disposeAIFunctions = registerBuiltinAIFunctions(this._aiRegistry);
    this._disposeOnnxFunction = initializeOnnxFunction(this._aiRegistry, this._onnxInitOptions);
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
          // For imported formulas, store the Excel-computed value in the engine
          // rather than re-evaluating the formula (which may produce incorrect results
          // due to unsupported functions or dependency ordering issues).
          // The formula is preserved in the store for display/editing.
          const v = cellData.value;
          if (v !== null && v !== undefined) {
            this.wb.setValue(sheetName, r, c, v as string | number | boolean);
          } else {
            // Only evaluate formula if we don't have a pre-computed value
            try {
              this.wb.setFormula(sheetName, r, c, cellData.formula);
            } catch {
              // Formula evaluation failed — leave cell empty in engine
            }
          }
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
    const parsed = this.canUseFormualizer()
      ? await this.parseFormulaWithFormualizer(formulaText, resolveArg)
      : this.parseFormulaWithRegex(formulaText, resolveArg);

    if (!parsed) return '#NAME?';
    return this._aiRegistry.execute(parsed.funcName, cellId, parsed.args);
  }

  /**
   * Determine whether the Formualizer parser is available at runtime.
   */
  private canUseFormualizer(): boolean {
    return typeof FormulaDialect !== 'undefined' && typeof parse === 'function';
  }

  /**
   * Parse an AI formula using the Formualizer AST parser.
   * Returns null if parsing fails or the function is unrecognized.
   */
  private async parseFormulaWithFormualizer(
    formulaText: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): Promise<{ funcName: string; args: EvalValue[] } | null> {
    let ast: ASTNodeData | null;
    try {
      ast = await parse(formulaText, FormulaDialect.Excel);
    } catch (e) {
      console.error('[AI Formula] Parse error:', e);
      return null;
    }

    if (!ast || ast.type !== 'function' || !ast.name) return null;

    const funcName = ast.name.toUpperCase();
    if (!this._aiRegistry.has(funcName)) return null;

    const args: EvalValue[] = [];
    if (ast.args && ast.args.length > 0) {
      for (const argNode of ast.args) {
        if (!argNode) continue;
        const resolved = await this._resolveAIArgument(argNode as ASTNodeData, resolveArg);
        args.push(resolved);
      }
    }

    return { funcName, args };
  }

  /**
   * Parse an AI formula using the regex fallback (when Formualizer is unavailable).
   * Returns null if the formula doesn't match or the function is unrecognized.
   */
  private parseFormulaWithRegex(
    formulaText: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): { funcName: string; args: EvalValue[] } | null {
    const match = formulaText.match(/^=((?:AI|ONNX)\.[A-Z0-9_-]+)\((.*)\)$/i);
    if (!match) return null;

    const funcName = match[1].toUpperCase();
    if (!this._aiRegistry.has(funcName)) return null;

    const args: EvalValue[] = [];
    const rawArgs = match[2];
    if (rawArgs.trim()) {
      const splitArgs = this._splitArgs(rawArgs);
      for (const arg of splitArgs) {
        args.push(this.resolveArgumentValue(arg.trim(), resolveArg));
      }
    }

    return { funcName, args };
  }

  /**
   * Resolve a raw string argument to its typed EvalValue.
   * Handles: quoted strings, numeric literals, range references, cell references, and plain text fallback.
   * This is the single source of truth for argument type detection, used by both
   * the regex fallback parser and the AST-based argument resolver.
   */
  private resolveArgumentValue(
    trimmed: string,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): EvalValue {
    // Quoted string literal
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // Numeric literal
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    // Range reference (e.g. A1:B5)
    if (/^[A-Z]+\d+:[A-Z]+\d+$/i.test(trimmed)) {
      const rangeResult = this._resolveRange(trimmed, resolveArg);
      const firstCell = rangeResult[0]?.[0];
      if (firstCell && typeof firstCell === 'object' && '__refError' in firstCell) {
        return '#REF!';
      }
      return rangeResult;
    }

    // Single cell reference (e.g. A1)
    if (/^[A-Z]+\d+$/i.test(trimmed)) {
      return resolveArg(trimmed);
    }

    // Unrecognized — return as-is
    return trimmed;
  }

  isAIFormula(formula: string): boolean {
    return /^=(AI\.|ONNX\.)[A-Z0-9_-]+\(/i.test(formula);
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
    const argStr = this.astNodeToString(argNode);
    const trimmed = argStr.trim();

    // Try resolving as a simple value (string, number, range, cell ref)
    const simpleResult = this.resolveArgumentValue(trimmed, resolveArg);
    if (simpleResult !== trimmed) {
      return simpleResult;
    }

    // Not a simple literal — attempt full AST evaluation as an expression
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
      case 'reference':
        return this._evaluateReference(ast, resolveArg);
      case 'number':
        return ast.value ?? 0;
      case 'text':
        return ast.value ?? '';
      case 'boolean':
        return ast.value ?? false;
      case 'binaryOp': {
        const left = await this._evaluateAST(ast.left!, resolveArg);
        const right = await this._evaluateAST(ast.right!, resolveArg);
        return this._evaluateBinaryOp(left, right, ast.op!);
      }
      case 'unaryOp': {
        const operand = await this._evaluateAST(ast.operand!, resolveArg);
        return this._evaluateUnaryOp(operand, ast.op!);
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

  /**
   * Evaluate a reference AST node — single cell or range.
   */
  private _evaluateReference(
    ast: ASTNodeData,
    resolveArg: (ref: string) => string | number | boolean | null,
  ): EvalValue {
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

  /**
   * Numeric operator lookup for binary operations.
   */
  private static readonly NUMERIC_OPS: Record<string, (a: number, b: number) => EvalValue> = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => b !== 0 ? a / b : '#DIV/0!',
    '^': (a, b) => Math.pow(a, b),
  };

  /**
   * Evaluate a binary operation between two resolved values.
   * Handles arithmetic, concatenation, and comparisons.
   */
  private _evaluateBinaryOp(left: EvalValue, right: EvalValue, op: string): EvalValue {
    if (left === null || right === null) return null;

    // Numeric arithmetic
    if (typeof left === 'number' && typeof right === 'number') {
      const numericOp = SpreadsheetEngine.NUMERIC_OPS[op];
      if (numericOp) return numericOp(left, right);
    }

    // Concatenation
    if (op === '&') return String(left) + String(right);

    // Comparisons (work for both numeric and non-numeric)
    return this._evaluateComparison(left, right, op);
  }

  /**
   * Evaluate a comparison operator between two values.
   */
  private _evaluateComparison(left: EvalValue, right: EvalValue, op: string): EvalValue {
    switch (op) {
      case '=': return left === right;
      case '<>': return left !== right;
      case '<': return (left as number | string) < (right as number | string);
      case '<=': return (left as number | string) <= (right as number | string);
      case '>': return (left as number | string) > (right as number | string);
      case '>=': return (left as number | string) >= (right as number | string);
      default: return null;
    }
  }

  /**
   * Evaluate a unary operation on a resolved value.
   */
  private _evaluateUnaryOp(operand: EvalValue, op: string): EvalValue {
    if (operand === null) return null;
    if (op === '-' && typeof operand === 'number') return -operand;
    if (op === '+' && typeof operand === 'number') return +operand;
    return operand;
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

  getFunctionList(): FunctionInfo[] {
    const formualizerFunctions = this.getFormualizerFunctions();
    const aiFunctions = getAIFunctionList(this._aiRegistry);
    return mergeFunctionSources(formualizerFunctions, CORE_FUNCTIONS, EXTENDED_FUNCTIONS, aiFunctions);
  }

  /**
   * Retrieve functions reported by the Formualizer engine (if available).
   */
  private getFormualizerFunctions(): FunctionInfo[] {
    try {
      const registered = this.wb.listFunctions();
      return registered.map(fn => ({
        name: fn.name,
        description: `Built-in function (${fn.minArgs}–${fn.maxArgs ?? '∞'} args)${fn.volatile ? ' [volatile]' : ''}`,
        category: 'Formulas',
        syntax: `${fn.name}(${Array.from({ length: fn.minArgs }, (_, i) => `arg${i + 1}`).join(', ')}${fn.maxArgs === null || fn.maxArgs > fn.minArgs ? ', ...' : ''})`,
      }));
    } catch {
      return [];
    }
  }

  private _functionMap: Map<string, { description: string; category: string; syntax: string }> | null = null;
  private buildFunctionMap() {
    if (this._functionMap) return this._functionMap;
    const allFunctions = mergeFunctionSources(CORE_FUNCTIONS, EXTENDED_FUNCTIONS, this.getFormualizerFunctions());
    const m = new Map<string, { description: string; category: string; syntax: string }>();
    for (const fn of allFunctions) {
      m.set(fn.name.toUpperCase(), { description: fn.description, category: fn.category, syntax: fn.syntax });
    }
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
    if (this._disposeOnnxFunction) {
      this._disposeOnnxFunction();
      this._disposeOnnxFunction = null;
    }
    this._aiRegistry.dispose();
  }
}
/**
 * STUB for @ocean8219/formualizer — NOT the real formula engine.
 *
 * The default `vitest run` tier aliases the WASM engine to this file (see the
 * `test.alias` in vite.config.ts) so unit tests can run in Node without a .wasm
 * loader. It implements a MINIMAL evaluator: literal arithmetic, a single
 * binary op, single cell refs, and SUM(range).
 *
 * It deliberately does NOT model: the dependency graph, recalculation
 * propagation (`evaluateAll` is a no-op), structural reference rewrites on
 * insert/delete, cross-sheet references, circular-reference detection, or
 * error propagation (`#REF!`, most `#...!` errors).
 *
 * Therefore a passing unit-tier run verifies APP LOGIC against a toy engine,
 * not real-engine behavior. Real-engine semantics are covered separately by the
 * integration tier that loads the actual WASM:
 *   npx vitest run --config vitest.integration.config.ts
 */

type CellVal = null | boolean | number | string;

class WorkbookStub {
  private sheets: Map<string, Map<string, CellVal>> = new Map();
  private formulas: Map<string, Map<string, string>> = new Map();

  addSheet(name: string): void {
    if (!this.sheets.has(name)) {
      this.sheets.set(name, new Map());
      this.formulas.set(name, new Map());
    }
  }

  sheetNames(): string[] {
    return Array.from(this.sheets.keys());
  }

  setValue(sheet: string, row: number, col: number, value: CellVal): void {
    if (!this.sheets.has(sheet)) this.addSheet(sheet);
    const key = `${row}:${col}`;
    this.sheets.get(sheet)!.set(key, value);
    this.formulas.get(sheet)!.delete(key);
  }

  setFormula(sheet: string, row: number, col: number, formula: string): void {
    if (!this.sheets.has(sheet)) this.addSheet(sheet);
    const key = `${row}:${col}`;
    this.formulas.get(sheet)!.set(key, formula);
    this.sheets.get(sheet)!.delete(key);
  }

  evaluateCell(sheet: string, row: number, col: number): CellVal {
    const key = `${row}:${col}`;
    const formula = this.formulas.get(sheet)?.get(key);
    if (formula !== undefined) return this._evalFormula(sheet, formula);
    return this.sheets.get(sheet)?.get(key) ?? null;
  }

  private _evalFormula(sheet: string, formula: string): CellVal {
    const expr = formula.startsWith('=') ? formula.slice(1) : formula;

    // Resolve a single cell ref like A1 or B2
    const resolveRef = (ref: string): CellVal => {
      const m = ref.match(/^([A-Za-z]+)(\d+)$/);
      if (!m) return null;
      const col = this._letterToCol(m[1]) + 1;
      const row = parseInt(m[2], 10);
      return this.evaluateCell(sheet, row, col);
    };

    // SUM(range or list)
    const sumMatch = expr.match(/^SUM\((.+)\)$/i);
    if (sumMatch) {
      return this._rangeValues(sheet, sumMatch[1]).reduce((a: number, v) => a + (Number(v) || 0), 0);
    }

    // Simple binary arithmetic between two cell refs or numbers: A1/A2, A1+B1, etc.
    const binMatch = expr.match(/^([A-Za-z]+\d+|[\d.]+)\s*([+\-*/])\s*([A-Za-z]+\d+|[\d.]+)$/);
    if (binMatch) {
      const left = /^[\d.]+$/.test(binMatch[1]) ? Number(binMatch[1]) : Number(resolveRef(binMatch[1]));
      const right = /^[\d.]+$/.test(binMatch[3]) ? Number(binMatch[3]) : Number(resolveRef(binMatch[3]));
      const op = binMatch[2];
      if (op === '/' && right === 0) return '#DIV/0!';
      if (op === '+') return left + right;
      if (op === '-') return left - right;
      if (op === '*') return left * right;
      if (op === '/') return left / right;
    }

    // Single cell ref
    if (/^[A-Za-z]+\d+$/.test(expr)) return resolveRef(expr);

    // Unknown function
    if (/^[A-Z]+\(/.test(expr)) return '#NAME?';

    // Plain number
    if (/^-?[\d.]+$/.test(expr)) return Number(expr);

    return expr;
  }

  private _rangeValues(sheet: string, rangeStr: string): CellVal[] {
    const rangeMatch = rangeStr.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
    if (!rangeMatch) return [];
    const c1 = this._letterToCol(rangeMatch[1]) + 1;
    const r1 = parseInt(rangeMatch[2], 10);
    const c2 = this._letterToCol(rangeMatch[3]) + 1;
    const r2 = parseInt(rangeMatch[4], 10);
    const vals: CellVal[] = [];
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        vals.push(this.evaluateCell(sheet, r, c));
    return vals;
  }

  private _letterToCol(letter: string): number {
    const upper = letter.toUpperCase();
    let result = 0;
    for (let i = 0; i < upper.length; i++)
      result = result * 26 + (upper.charCodeAt(i) - 64);
    return result - 1;
  }

  evaluateAll(): void {}
  registerFunction(_name: string, _cb: unknown, _opts?: unknown): void {}
  unregisterFunction(_name: string): void {}
  listFunctions(): unknown[] { return []; }
  free(): void {}
}

export const Workbook = WorkbookStub;
export type WorkbookApi = WorkbookStub;

export async function initializeWasm(): Promise<void> {}
export default initializeWasm;

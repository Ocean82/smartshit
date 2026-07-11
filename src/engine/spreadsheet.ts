import HyperFormula from 'hyperformula';
import type { SheetData, WorkbookData, PivotConfig, PivotResult } from '@/types';
import { v4 as uuid } from 'uuid';

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
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result - 1;
}

export function cellToRef(cellId: string): { row: number; col: number } {
  const match = cellId.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { row: 0, col: 0 };
  return { row: parseInt(match[2]) - 1, col: letterToCol(match[1]) };
}

export function refToCell(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
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
  private hf: HyperFormula;
  private sheetMapping: Map<string, number> = new Map();

  constructor() {
    this.hf = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
      precisionRounding: 10,
    });
  }

  loadWorkbook(workbook: WorkbookData): void {
    // Rebuild from scratch
    this.hf.destroy();
    this.hf = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3',
      precisionRounding: 10,
    });
    this.sheetMapping.clear();

    for (const sheet of workbook.sheets) {
      this.loadSheet(sheet);
    }
  }

  loadSheet(sheet: SheetData): void {
    let maxRow = 0;
    let maxCol = 0;
    const cellEntries = Object.entries(sheet.cells);
    for (const [cellId] of cellEntries) {
      const ref = cellToRef(cellId);
      maxRow = Math.max(maxRow, ref.row + 1);
      maxCol = Math.max(maxCol, ref.col + 1);
    }

    const rows = Math.max(maxRow, 1);
    const cols = Math.max(maxCol, 1);
    const data: (string | number | boolean | null)[][] = Array.from(
      { length: rows },
      () => Array(cols).fill(null)
    );

    for (const [cellId, cellData] of cellEntries) {
      const ref = cellToRef(cellId);
      data[ref.row][ref.col] = cellData.formula
        ? cellData.formula
        : cellData.value;
    }

    try {
      const sheetName = this.hf.addSheet(sheet.name);
      const hfId = this.hf.getSheetId(sheetName);
      if (hfId !== undefined) {
        this.hf.setSheetContent(hfId, data);
        this.sheetMapping.set(sheet.id, hfId);
      }
    } catch {
      // Sheet might already exist
    }
  }

  getCellValue(sheetId: string, row: number, col: number): unknown {
    const hfSheetId = this.sheetMapping.get(sheetId);
    if (hfSheetId === undefined) return null;
    try {
      return this.hf.getCellValue({ sheet: hfSheetId, row, col });
    } catch {
      return null;
    }
  }

  setCellValue(sheetId: string, row: number, col: number, value: string | number | boolean | null): void {
    const hfSheetId = this.sheetMapping.get(sheetId);
    if (hfSheetId === undefined) return;
    try {
      const dims = this.hf.getSheetDimensions(hfSheetId);
      if (row >= dims.height) {
        this.hf.addRows(hfSheetId, [dims.height, row - dims.height + 1]);
      }
      if (col >= dims.width) {
        this.hf.addColumns(hfSheetId, [dims.width, col - dims.width + 1]);
      }
      this.hf.setCellContents({ sheet: hfSheetId, row, col }, [[value]]);
    } catch (e) {
      console.error('Error setting cell value:', e);
    }
  }

  getComputedValue(sheetId: string, row: number, col: number): string {
    const val = this.getCellValue(sheetId, row, col);
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return '#ERROR!';
    return String(val);
  }

  getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }> {
    if (!this.hf) return [];
    try {
      const builtIn = (this.hf as any).constructor?.defaultConfig?.functionRegistry;
      if (!builtIn) {
        return this.getFallbackFunctions();
      }
      return Object.entries(builtIn).map(([name, info]: [string, any]) => ({
        name: name.toUpperCase(),
        description: info.description || '',
        category: info.category || 'General',
        syntax: info.syntax || name.toUpperCase() + '()',
      }));
    } catch {
      return this.getFallbackFunctions();
    }
  }

  getFunctionInfo(name: string): { name: string; description: string; category: string; syntax: string } | null {
    const fns = this.getFunctionList();
    return fns.find(f => f.name === name.toUpperCase()) || null;
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

  computePivotTable(
    cells: Record<string, { value: string | number | boolean | null }>,
    config: PivotConfig,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number
  ): PivotResult {
    const sourceRows: Record<string, (string | number | boolean | null)[]>[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const row: Record<string, (string | number | boolean | null)[]> = {};
      for (let c = startCol; c <= endCol; c++) {
        const colLetter = colToLetter(c);
        const cellId = refToCell(r, c);
        row[colLetter] = [cells[cellId]?.value ?? null];
      }
      sourceRows.push(row);
    }

    const rowKeyMap = new Map<string, (string | number)[]>();
    const colKeyMap = new Map<string, (string | number)[]>();
    const valueAggMap = new Map<string, number[]>();

    for (const sourceRow of sourceRows) {
      const rowKeyParts = config.rows.map(f => String(sourceRow[f.sourceColumn]?.[0] ?? ''));
      const rowKey = rowKeyParts.join('||');
      if (!rowKeyMap.has(rowKey)) rowKeyMap.set(rowKey, rowKeyParts);

      const colKeyParts = config.columns.map(f => String(sourceRow[f.sourceColumn]?.[0] ?? ''));
      const colKey = colKeyParts.join('||');
      if (!colKeyMap.has(colKey)) colKeyMap.set(colKey, colKeyParts);

      const aggKey = `${rowKey}||${colKey}`;
      const existing = valueAggMap.get(aggKey) || [];

      for (const vf of config.values) {
        const rawVal = sourceRow[vf.sourceColumn]?.[0];
        const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
        if (!isNaN(numVal)) existing.push(numVal);
      }
      valueAggMap.set(aggKey, existing);
    }

    const rowFieldLabels = config.rows.map(f => f.label || f.sourceColumn);
    const colFieldLabels = config.columns.map(f => f.label || f.sourceColumn);
    const valueLabels = config.values.map(f => f.label || `${f.aggregation}(${f.sourceColumn})`);

    const colKeys = Array.from(colKeyMap.keys());
    const headers = [...rowFieldLabels, ...colKeys.flatMap(ck => {
      const parts = colKeyMap.get(ck)!;
      return valueLabels.map(vl => [...parts, vl].join(' '));
    })];

    const resultRows: (string | number)[][] = [];
    for (const [rowKey, rowParts] of rowKeyMap) {
      const row: (string | number)[] = [...rowParts];
      for (const colKey of colKeys) {
        const values = valueAggMap.get(`${rowKey}||${colKey}`) || [];
        for (const vf of config.values) {
          switch (vf.aggregation) {
            case 'sum': row.push(values.reduce((a, b) => a + b, 0)); break;
            case 'average': row.push(values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0); break;
            case 'count': row.push(values.length); break;
            case 'min': row.push(values.length ? Math.min(...values) : 0); break;
            case 'max': row.push(values.length ? Math.max(...values) : 0); break;
            case 'distinctCount': row.push(new Set(values).size); break;
          }
        }
      }
      resultRows.push(row);
    }

    return { headers, rows: resultRows, grandTotals: [] };
  }

  destroy(): void {
    this.hf.destroy();
  }
}

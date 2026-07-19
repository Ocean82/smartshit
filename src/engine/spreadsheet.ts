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
      // Get all registered function names from HyperFormula
      const registeredFunctions = HyperFormula.getRegisteredFunctionNames('enGB');
      if (registeredFunctions && registeredFunctions.length > 0) {
        return registeredFunctions.map((name: string) => {
          // Try to get function metadata
          const info = this.getFallbackInfo(name);
          return {
            name: name.toUpperCase(),
            description: info?.description || '',
            category: info?.category || 'General',
            syntax: info?.syntax || name.toUpperCase() + '()',
          };
        });
      }
      return this.getFallbackFunctions();
    } catch {
      return this.getFallbackFunctions();
    }
  }

  private getFallbackInfo(name: string): { description: string; category: string; syntax: string } | null {
    const map = this.buildFunctionMap();
    return map.get(name.toUpperCase()) || null;
  }

  private _functionMap: Map<string, { description: string; category: string; syntax: string }> | null = null;
  private buildFunctionMap() {
    if (this._functionMap) return this._functionMap;
    const m = new Map<string, { description: string; category: string; syntax: string }>();
    for (const fn of this.getFallbackFunctions()) {
      m.set(fn.name, { description: fn.description, category: fn.category, syntax: fn.syntax });
    }
    // Add extended functions from HyperFormula that aren't in fallback
    for (const fn of this.getExtendedFunctions()) {
      m.set(fn.name, { description: fn.description, category: fn.category, syntax: fn.syntax });
    }
    this._functionMap = m;
    return m;
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

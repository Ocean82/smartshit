import HyperFormula from 'hyperformula';
import type { SheetData, WorkbookData } from '@/types';
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

  destroy(): void {
    this.hf.destroy();
  }
}

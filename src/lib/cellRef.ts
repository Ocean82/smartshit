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

export function tryCellToRef(cellId: string): { row: number; col: number } | null {
  const match = typeof cellId === 'string' ? cellId.match(CELL_ID_RE) : null;
  if (!match) return null;
  const row = parseInt(match[2], 10) - 1;
  if (row < 0) return null;
  return { row, col: letterToCol(match[1]) };
}

export function cellToRef(cellId: string): { row: number; col: number } {
  return tryCellToRef(cellId) ?? { row: 0, col: 0 };
}

export function refToCell(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

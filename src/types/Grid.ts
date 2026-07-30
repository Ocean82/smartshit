// Type definitions
export interface GridCellData {
  row: number;
  colIndex?: string | null; // Allow undefined columns, not all rows need to be complete 
}
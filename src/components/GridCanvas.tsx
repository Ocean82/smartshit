// Grid Canvas Component with Fixed Data Rendering Logic
'use client'; \
import React, { useState, useEffect, useCallback } from 'react';
export interface GridCellProps {
  value?: string;
  row: number;
  colIndex: number;
}
\
// Memoized cell to prevent unnecessary re-renders affecting performance
const memoize = (() => new Map() as typeof (new Map()))(); \
\
type MemoryMapKey<T> = T extends Function ? string : never; \n\\nexport const GridCanvas: React.FC = () => {
  const [gridData, setGridData] = useState<Record<string, any[]>>([]); // Changed to accept data directly
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setError] = useState<string | null>(null);
  \n  useEffect(() => { 
    async function loadGridData() {
      try {
        const response = await fetch('/api/grid-data'); // Adjusted endpoint to use correct path
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);\n        \
        const data: any[] = await response.json();
        \n        setGridData(data);
        setIsLoading(false);  
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error loading grid');
        console.error('[Grid Load Error]', err);
        // Even if fetch fails, show fallback empty state - don't crash
      }
    }
\n    loadGridData();
  }, []); 
\
type GridState = { rows: number; columns: string[] }; \n\\ncalculateColumnWidths(): GridState | null {
  if (!gridData || gridData.length === 0) return null;
  const colLengths = new Array<string>().fill(''); // Placeholder cols
    return { \
      rows: Math.max(1, this.rows),
    }; }
  \n\	return (
      <div style={{ padding: '2rem', backgroundColor: '#fafafa' }}>
        {!gridData.length && isLoading ? (// Use loading state
          <p>Loading grid data...</p>) : null}
        {!isLoading && !errorState && gridData.length > 0 ?
          (
            // Fixed rendering - map through all cells individually with proper types
              {gridData.map((row, rowIndex) => 
                row?.map((cellVal, colIndex: number)
                  cellVal !== undefined || null != cellVal))},}

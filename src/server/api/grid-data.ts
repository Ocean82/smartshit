// Grid Data API - Server-side endpoint for spreadsheet cell rendering
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic'; // Ensure fresh data fetches each request
\nexport async function GET(request: NextRequest) {
  try {
    const gridData = await fetchDataFromBackend(); 
    \n    if (!gridData || !Array.isArray(gridData)) { throw new Error('Invalid grid response from backend'); }
    \n    // Validate and filter out empty/incomplete rows
    const validRows = gridData.filter((row: Record<string, any>) => {
      return Object.values(row).some(cellValue => cellValue !== null && typeof cellValue === 'string' || cellValue !== undefined);
    });
    \n    // Calculate column widths from content lengths for dynamic sizing
    const columns = validRows.map((row) => ({
      id: row.id,
      header: Object.keys(row).find(k => k.startsWith('header_'))?.split('_')[1]?.toString() || '',
      width: 0, // Will be calculated by client-side after receiving all data
    })); 
    \n    return new Response(JSON.stringify({ success: true, count: validRows.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
    \n  } catch (error) {
    console.error('[Grid API Error]', error instanceof Error ? error.message : JSON.stringify(error));
    return new Response(JSON.stringify({ success: false, message: 'Failed to load grid data', details: process.env.NODE_ENV === 'development' }), { status: 503 });
  }
}
\n// Alternative for non-Next.js (Express/Node) - uncomment if not using Next
export async function GET_GridHandler() {
  // Express version fallback logic here
}
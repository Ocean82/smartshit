const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface GridDataResponse {
  success: boolean;
  count?: number;
  message?: string;
}

export async function fetchGridData(workbookId: string): Promise<GridDataResponse> {
  const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch grid data: ${res.status}`);
  }

  const data = await res.json();
  return { success: true, count: Array.isArray(data) ? data.length : 0 };
}

/**
 * Cloud Sync — Background sync of workbooks to the server.
 * Offline-first: localStorage remains primary, cloud is async background sync.
 */

import type { WorkbookData } from '@/types'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'offline' | 'error'

export interface CloudWorkbook {
  id: string
  name: string
  size_bytes: number
  sheet_count: number
  last_saved_at: string
  created_at: string
}

export interface SaveResult {
  saved: boolean
  version: number
  sizeBytes: number
}

export interface CreateResult {
  id: string
  s3Key: string
  sizeBytes: number
  version: number
}

export interface VersionEntry {
  id: string
  version_number: number
  size_bytes: number
  description: string
  created_at: string
}

// ─── State ───────────────────────────────────────────────────────────────────

let _syncStatus: SyncStatus = 'idle'
let _listeners: Array<(status: SyncStatus) => void> = []
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _currentCloudId: string | null = null

const DEBOUNCE_MS = 5_000 // 5 seconds after last edit

export function getSyncStatus(): SyncStatus {
  return _syncStatus
}

export function getCloudWorkbookId(): string | null {
  return _currentCloudId
}

export function setCloudWorkbookId(id: string | null): void {
  _currentCloudId = id
  if (id) {
    localStorage.setItem('smartsht-cloud-workbook-id', id)
  } else {
    localStorage.removeItem('smartsht-cloud-workbook-id')
  }
}

// Restore from localStorage on load
const storedCloudId = localStorage.getItem('smartsht-cloud-workbook-id')
if (storedCloudId) _currentCloudId = storedCloudId

export function onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
  _listeners.push(listener)
  return () => {
    _listeners = _listeners.filter((l) => l !== listener)
  }
}

function setSyncStatus(status: SyncStatus): void {
  _syncStatus = status
  _listeners.forEach((l) => l(status))
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  // In a real Clerk integration, this would be:
  // const token = await getToken()
  // return { Authorization: `Bearer ${token}` }
  //
  // For now we pass the userId from Clerk's useAuth() via a header
  const userId = localStorage.getItem('smartsht-user-id')
  if (!userId) return {}
  return { 'x-user-id': userId }
}

export function setUserId(userId: string): void {
  localStorage.setItem('smartsht-user-id', userId)
}

export function getUserId(): string | null {
  return localStorage.getItem('smartsht-user-id')
}

export function isCloudConfigured(): boolean {
  return Boolean(getUserId())
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/**
 * List all cloud workbooks for the current user.
 */
export async function listCloudWorkbooks(): Promise<CloudWorkbook[]> {
  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return []

  try {
    const res = await fetch(`${API_BASE}/api/workbooks`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return []
    const json = (await res.json()) as { workbooks: CloudWorkbook[] }
    return json.workbooks
  } catch {
    return []
  }
}

/**
 * Load a workbook from the cloud by ID.
 */
export async function loadFromCloud(workbookId: string): Promise<WorkbookData | null> {
  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return null

  try {
    const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return null
    const data = (await res.json()) as WorkbookData
    setCloudWorkbookId(workbookId)
    return data
  } catch {
    return null
  }
}

/**
 * Save (create new) a workbook to the cloud.
 */
export async function createInCloud(workbook: WorkbookData): Promise<CreateResult | null> {
  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return null

  setSyncStatus('syncing')

  try {
    const res = await fetch(`${API_BASE}/api/workbooks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: workbook.name,
        data: JSON.stringify(workbook),
        sheetCount: workbook.sheets.length,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      setSyncStatus('error')
      return null
    }

    const result = (await res.json()) as CreateResult
    setCloudWorkbookId(result.id)
    setSyncStatus('saved')
    return result
  } catch {
    setSyncStatus('error')
    return null
  }
}

/**
 * Save (update existing) a workbook to the cloud.
 */
export async function saveToCloud(workbook: WorkbookData): Promise<SaveResult | null> {
  const cloudId = _currentCloudId
  if (!cloudId) return null

  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return null

  setSyncStatus('syncing')

  try {
    const res = await fetch(`${API_BASE}/api/workbooks/${cloudId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: workbook.name,
        data: JSON.stringify(workbook),
        sheetCount: workbook.sheets.length,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      setSyncStatus('error')
      return null
    }

    const result = (await res.json()) as SaveResult
    setSyncStatus('saved')
    return result
  } catch {
    setSyncStatus('offline')
    return null
  }
}

/**
 * Delete a cloud workbook (soft-delete).
 */
export async function deleteFromCloud(workbookId: string): Promise<boolean> {
  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return false

  try {
    const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}`, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (workbookId === _currentCloudId) {
      setCloudWorkbookId(null)
    }

    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch version history for a workbook.
 */
export async function listVersions(workbookId: string): Promise<VersionEntry[]> {
  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return []

  try {
    const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}/versions`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return []
    const json = (await res.json()) as { versions: VersionEntry[] }
    return json.versions
  } catch {
    return []
  }
}

/**
 * Download a specific version of a workbook.
 */
export async function loadVersion(
  workbookId: string,
  versionId: string,
): Promise<WorkbookData | null> {
  const headers = getAuthHeaders()
  if (!headers['x-user-id']) return null

  try {
    const res = await fetch(
      `${API_BASE}/api/workbooks/${workbookId}/versions/${versionId}`,
      {
        headers: { ...headers, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!res.ok) return null
    return (await res.json()) as WorkbookData
  } catch {
    return null
  }
}

// ─── Debounced Auto-Save ─────────────────────────────────────────────────────

/**
 * Schedule a debounced cloud save. Call this on every workbook mutation.
 * Waits 5 seconds after the last edit, then syncs to cloud.
 */
export function scheduleSave(workbook: WorkbookData): void {
  if (!isCloudConfigured() || !_currentCloudId) return

  if (_debounceTimer) {
    clearTimeout(_debounceTimer)
  }

  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    void saveToCloud(workbook)
  }, DEBOUNCE_MS)
}

/**
 * Force an immediate save (e.g., on page unload or manual save).
 */
export function flushSave(workbook: WorkbookData): void {
  if (!isCloudConfigured() || !_currentCloudId) return

  if (_debounceTimer) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }

  void saveToCloud(workbook)
}

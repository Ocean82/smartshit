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
const storedCloudId =
  typeof localStorage !== 'undefined' ? localStorage.getItem('smartsht-cloud-workbook-id') : null
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

type TokenProvider = () => Promise<string | null>
let _tokenProvider: TokenProvider | null = null

export function setAuthTokenProvider(provider: TokenProvider): void {
  _tokenProvider = provider
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = _tokenProvider ? await _tokenProvider() : null
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function setUserId(userId: string | null): void {
  if (typeof localStorage === 'undefined') return
  if (userId) localStorage.setItem('smartsht-user-id', userId)
  else localStorage.removeItem('smartsht-user-id')
}

export function getUserId(): string | null {
  if (typeof localStorage === 'undefined') return null
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
  if (!isCloudConfigured()) return []

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return []

    const res = await fetch(`${API_BASE}/api/workbooks`, {
      headers,
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
  if (!isCloudConfigured()) return null

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return null

    const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}`, {
      headers,
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
  if (!isCloudConfigured()) return null

  setSyncStatus('syncing')

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) {
      setSyncStatus('error')
      return null
    }

    const res = await fetch(`${API_BASE}/api/workbooks`, {
      method: 'POST',
      headers,
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
  if (!cloudId || !isCloudConfigured()) return null

  setSyncStatus('syncing')

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) {
      setSyncStatus('error')
      return null
    }

    const res = await fetch(`${API_BASE}/api/workbooks/${cloudId}`, {
      method: 'PUT',
      headers,
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
  if (!isCloudConfigured()) return false

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return false

    const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}`, {
      method: 'DELETE',
      headers,
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
  if (!isCloudConfigured()) return []

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return []

    const res = await fetch(`${API_BASE}/api/workbooks/${workbookId}/versions`, {
      headers,
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
  if (!isCloudConfigured()) return null

  try {
    const headers = await getAuthHeaders()
    if (!headers.Authorization) return null

    const res = await fetch(
      `${API_BASE}/api/workbooks/${workbookId}/versions/${versionId}`,
      {
        headers,
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

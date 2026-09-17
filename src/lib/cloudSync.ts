/**
 * Cloud Sync — Background sync of workbooks to the server.
 * Offline-first: localStorage remains primary, cloud is async background sync.
 */

import type { WorkbookData } from '@/types'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'offline' | 'error' | 'too-large'

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
// One debounce timer per cloud workbook id. Keying by id keeps a pending save
// for workbook A independent of one for workbook B, so switching files can
// never flush the wrong workbook's contents over another's cloud slot.
const _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

const DEBOUNCE_MS = 5_000 // 5 seconds after last edit

export function getSyncStatus(): SyncStatus {
  return _syncStatus
}

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

/**
 * Map a failed save response to a sync status.
 *
 * 413 is called out separately: the workbook exceeded the server's body limit,
 * which is permanent until the sheet shrinks. Reporting it as a generic error
 * left users retrying a save that could never succeed.
 */
function statusForFailedSave(res: Response): SyncStatus {
  return res.status === 413 ? 'too-large' : 'error'
}

/** Human-readable explanation for the current sync status, if noteworthy. */
export function describeSyncStatus(status: SyncStatus): string | null {
  switch (status) {
    case 'too-large':
      return 'This workbook is too large to save to the cloud. Remove unused rows or split it across files.'
    case 'error':
      return 'Could not save to the cloud. Your work is still saved locally.'
    case 'offline':
      return 'You appear to be offline. Your work is saved locally and will sync later.'
    default:
      return null
  }
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
      setSyncStatus(statusForFailedSave(res))
      return null
    }

    const result = (await res.json()) as CreateResult
    setSyncStatus('saved')
    return result
  } catch {
    setSyncStatus('error')
    return null
  }
}

/**
 * Save (update existing) a workbook to the cloud.
 *
 * The target cloud id is passed in by the caller (resolved from the active
 * file) — never read from mutable module state — so the workbook contents and
 * the cloud slot they are written to always belong to the same file.
 */
export async function saveToCloud(
  cloudId: string,
  workbook: WorkbookData,
): Promise<SaveResult | null> {
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
      setSyncStatus(statusForFailedSave(res))
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
 * Schedule a debounced cloud save for a specific cloud workbook id. Call this
 * on every workbook mutation, passing the active file's cloud id. Waits 5
 * seconds after the last edit for that id, then syncs to cloud.
 *
 * No-ops when the file is not cloud-bound (no id) or cloud is unconfigured.
 * The (id, workbook) pair is captured now, so a later file switch cannot
 * redirect this save to a different workbook.
 */
export function scheduleSave(cloudId: string | null | undefined, workbook: WorkbookData): void {
  if (!isCloudConfigured() || !cloudId) return

  const existing = _debounceTimers.get(cloudId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    _debounceTimers.delete(cloudId)
    void saveToCloud(cloudId, workbook)
  }, DEBOUNCE_MS)
  _debounceTimers.set(cloudId, timer)
}

/**
 * Force an immediate save for a specific cloud workbook id (e.g., on page
 * unload or manual save). No-ops when not cloud-bound or unconfigured.
 */
export function flushSave(cloudId: string | null | undefined, workbook: WorkbookData): void {
  if (!isCloudConfigured() || !cloudId) return

  const existing = _debounceTimers.get(cloudId)
  if (existing) {
    clearTimeout(existing)
    _debounceTimers.delete(cloudId)
  }

  void saveToCloud(cloudId, workbook)
}

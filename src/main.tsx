import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { SharedView } from '@/components/SharedView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider, AuthGate, ClerkUserSync } from '@/auth'
import { useStore } from '@/store/useStore'
import { savePersistedState, savePersistedStateAsync } from '@/lib/persistence'
import { hydrateFromIdbIfNewer } from '@/store/hydrateFromIdb'
import { buildPersistenceSnapshot } from '@/lib/fileWorkbooks'
import { flushSave, isCloudConfigured } from '@/lib/cloudSync'
import { migrateLegacyStorageKeys } from '@/lib/storageKeys'
import { initErrorReporting } from '@/lib/errorReporting'

// Initialize error reporting (no-op if VITE_SENTRY_DSN is not set)
initErrorReporting()

migrateLegacyStorageKeys()

// Warn once per failure episode — the snapshot save runs on every store change
// (debounced 400ms), so we must not toast on every keystroke while blocked.
let localSaveBlocked = false

/** Snapshot the live store into the persisted shape. */
function currentSnapshot() {
  const s = useStore.getState()
  return buildPersistenceSnapshot({
    workbook: s.workbook,
    workbookSlots: s.workbookSlots,
    files: s.files,
    activeFileId: s.activeFileId,
    messages: s.messages,
  })
}

/** Surface a persistence failure to the user once per episode. */
function warnSaveFailedOnce(reason: 'quota' | 'error') {
  if (localSaveBlocked) return
  localSaveBlocked = true
  const cloud = isCloudConfigured()
  useStore.getState().showToast({
    type: 'warning',
    message: reason === 'quota'
      ? `Local autosave paused — browser storage is full. ${cloud ? 'Your work is still cloud-saved. ' : ''}Export a workbook or remove old ones to free space.`
      : 'Local autosave failed — export your work to avoid losing it.',
  })
}

/**
 * Durable autosave: IndexedDB primary + localStorage mirror. IDB is
 * size-uncapped, so large workbooks that overflow localStorage still persist;
 * we only warn when BOTH layers fail.
 */
async function persistLocalSnapshot() {
  const result = await savePersistedStateAsync(currentSnapshot())
  if (result.ok) {
    localSaveBlocked = false
    return
  }
  warnSaveFailedOnce(result.reason)
}

/**
 * Last-gasp save during page teardown. Uses the SYNCHRONOUS localStorage write:
 * an async IndexedDB transaction is not guaranteed to complete once the page is
 * being discarded, whereas localStorage.setItem is synchronous and reliable
 * here. The debounced path keeps IDB (the durable primary) up to date.
 */
function persistOnTeardown() {
  savePersistedState(currentSnapshot())
  if (isCloudConfigured()) {
    const s = useStore.getState()
    const cloudId = s.files.find((f) => f.id === s.activeFileId)?.cloudWorkbookId
    flushSave(cloudId, s.workbook)
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

useStore.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void persistLocalSnapshot(), 400)
})

// Reconcile the sync localStorage seed with the durable IndexedDB primary: if
// IDB holds a newer snapshot (e.g. last session's localStorage mirror was
// quota-truncated on a large workbook), swap it in — but only if the user
// hasn't touched anything yet. Self-guarded; safe to fire-and-forget.
void hydrateFromIdbIfNewer()

// Flush on teardown. `pagehide` is the reliable modern unload signal (fires for
// bfcache navigations where `beforeunload` may not), and `visibilitychange` →
// hidden covers mobile tab-switch/app-background where the page can be killed
// without ever firing pagehide. Both funnel through the synchronous save.
function handleTeardown() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistOnTeardown()
}

window.addEventListener('pagehide', handleTeardown)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') handleTeardown()
})

// Check if this is a shared workbook view (/shared/:token)
const sharedMatch = window.location.pathname.match(/^\/shared\/([a-f0-9-]+)$/i)

// Check if a shared workbook was imported (from "Make a copy" button)
const importedShared = localStorage.getItem('smartsht-import-shared')
if (importedShared && !sharedMatch) {
  try {
    const wb = JSON.parse(importedShared)
    // Defer import to after store is initialized
    setTimeout(() => {
      useStore.getState().loadWorkbookData(wb)
    }, 100)
  } catch {
    // ignore malformed data
  }
  localStorage.removeItem('smartsht-import-shared')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="SmartSht">
      {sharedMatch ? (
        <SharedView token={sharedMatch[1]} />
      ) : (
        <AuthProvider>
          <AuthGate>
            <ClerkUserSync />
            <App />
          </AuthGate>
        </AuthProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { SharedView } from '@/components/SharedView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider, AuthGate, ClerkUserSync } from '@/auth'
import { useStore } from '@/store/useStore'
import { savePersistedState } from '@/lib/persistence'
import { buildPersistenceSnapshot } from '@/lib/fileWorkbooks'
import { flushSave, isCloudConfigured } from '@/lib/cloudSync'
import { migrateLegacyStorageKeys } from '@/lib/storageKeys'
import { initErrorReporting } from '@/lib/errorReporting'

// Initialize error reporting (no-op if VITE_SENTRY_DSN is not set)
initErrorReporting()

migrateLegacyStorageKeys()

// Warn once per quota episode — the snapshot save runs on every store change
// (debounced 400ms), so we must not toast on every keystroke while full.
let localSaveBlocked = false

/** Compose and persist a full snapshot from the live store. */
function persistLocalSnapshot() {
  const s = useStore.getState()
  const result = savePersistedState(
    buildPersistenceSnapshot({
      workbook: s.workbook,
      workbookSlots: s.workbookSlots,
      files: s.files,
      activeFileId: s.activeFileId,
      messages: s.messages,
    }),
  )

  if (result.ok) {
    localSaveBlocked = false
    return
  }

  // Save failed. localStorage is the only local durability, so a silent failure
  // means the user's work isn't actually being persisted — surface it once.
  if (!localSaveBlocked) {
    localSaveBlocked = true
    const cloud = isCloudConfigured()
    useStore.getState().showToast({
      type: 'warning',
      message: result.reason === 'quota'
        ? `Local autosave paused — browser storage is full. ${cloud ? 'Your work is still cloud-saved. ' : ''}Export a workbook or remove old ones to free space.`
        : 'Local autosave failed — export your work to avoid losing it.',
    })
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

useStore.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(persistLocalSnapshot, 400)
})

// Flush local + cloud saves on page unload so nothing is lost on close.
window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistLocalSnapshot()
  if (isCloudConfigured()) flushSave(useStore.getState().workbook)
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

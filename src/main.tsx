import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { SharedView } from '@/components/SharedView'
import { AuthProvider, AuthGate, ClerkUserSync } from '@/auth'
import { useStore } from '@/store/useStore'
import { savePersistedState } from '@/lib/persistence'
import { migrateLegacyStorageKeys } from '@/lib/storageKeys'

migrateLegacyStorageKeys()

let saveTimer: ReturnType<typeof setTimeout> | null = null

useStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    savePersistedState({
      workbook: state.workbook,
      files: state.files,
      activeFileId: state.activeFileId,
      messages: state.messages,
    })
  }, 400)
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
  </StrictMode>,
)

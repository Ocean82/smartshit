import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useStore } from '@/store/useStore'
import { savePersistedState } from '@/lib/persistence'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

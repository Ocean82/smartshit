import { useCallback, useRef } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { v4 as uuid } from 'uuid'
import { useStore } from '@/store/useStore'
import { importWorkbookFromJsonFile, normalizeImportedWorkbook } from '@/io/workbookJson'
import { workbookHasContent } from '@/lib/workbookGuard'

interface JsonRestore {
  requestRestore: () => void
  /** Hidden file input; render it once in the calling component. */
  fileInput: ReactElement
}

/**
 * Restore a workbook from a JSON backup into the open file. One implementation
 * for every entry point (File menu, command palette), so none can skip the
 * confirmation: with content in the sheet the user confirms first, and the
 * restore is a single undo step (Ctrl+Z brings the previous workbook back).
 */
export function useJsonRestore(): JsonRestore {
  const inputRef = useRef<HTMLInputElement>(null)

  const requestRestore = useCallback(() => {
    const proceed = () => inputRef.current?.click()
    const { workbook, showConfirm } = useStore.getState()
    if (!workbookHasContent(workbook)) return proceed()
    showConfirm({
      title: 'Restore from backup',
      message: 'Restoring a backup will replace the current workbook, including its autosaved copy. You can undo this with Ctrl+Z.',
      confirmLabel: 'Restore',
      variant: 'warning',
      onConfirm: proceed,
    })
  }, [])

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const { addMessage, loadWorkbookData } = useStore.getState()
    try {
      const wb = normalizeImportedWorkbook(await importWorkbookFromJsonFile(file))
      loadWorkbookData(wb, { pushUndo: true })
      addMessage({ id: uuid(), role: 'assistant', content: `Restored workbook from **${file.name}**.`, timestamp: Date.now() })
    } catch (err) {
      addMessage({
        id: uuid(),
        role: 'assistant',
        content: `Could not restore **${file.name}**: ${err instanceof Error ? err.message : 'invalid backup'}.`,
        timestamp: Date.now(),
      })
    } finally {
      input.value = ''
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".json,.smartsht.json"
      className="hidden"
      aria-label="Restore workbook from JSON backup"
      onChange={handleChange}
    />
  )
  return { requestRestore, fileInput }
}

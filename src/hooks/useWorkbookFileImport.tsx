import { useCallback, useRef } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { v4 as uuid } from 'uuid'
import { useStore } from '@/store/useStore'
import { importWorkbookFromFileWithMeta } from '@/io/xlsx'
import { workbookHasContent } from '@/lib/workbookGuard'
import { recordTelemetry } from '@/ai/telemetry'

interface WorkbookFileImportOptions {
  /** Verb shown in the replace-workbook confirmation and undo label. */
  verb?: 'Open' | 'Import'
  onDone?: () => void
}

interface WorkbookFileImport {
  requestImport: () => void
  /** Hidden file input; render it once in the calling component. */
  fileInput: ReactElement
}

/**
 * Pick an .xlsx/.xls/.csv file and replace the workbook with it, confirming first
 * when the current workbook has content. Owns its file input so any surface can
 * offer import without depending on the toolbar being mounted.
 */
export function useWorkbookFileImport({ verb = 'Open', onDone }: WorkbookFileImportOptions = {}): WorkbookFileImport {
  const inputRef = useRef<HTMLInputElement>(null)

  const requestImport = useCallback(() => {
    const proceed = () => inputRef.current?.click()
    if (!workbookHasContent(useStore.getState().workbook)) return proceed()
    const action = `${verb} file`
    useStore.getState().showConfirm({
      title: action,
      message: `${verb === 'Open' ? 'Opening' : 'Importing'} a file will replace the current workbook and clear undo history. This cannot be undone.`,
      confirmLabel: action,
      variant: 'warning',
      onConfirm: proceed,
    })
  }, [verb])

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    if (!file) return
    const store = useStore.getState()
    try {
      store.pushHistory(`${verb} file`)
      const { workbook, meta } = await importWorkbookFromFileWithMeta(file)
      useStore.getState().importWorkbook(workbook, { fileName: file.name, warnings: meta.warnings })
      if (meta.warnings.length) recordTelemetry('importTruncationEvents', `File import: ${file.name}`)
    } catch {
      store.addMessage({
        id: uuid(),
        role: 'assistant',
        content: `Could not open **${file.name}**. Make sure it's a valid .xlsx or .csv file.`,
        timestamp: Date.now(),
      })
    } finally {
      input.value = ''
      onDone?.()
    }
  }

  const fileInput = (
    <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleChange} />
  )

  return { requestImport, fileInput }
}

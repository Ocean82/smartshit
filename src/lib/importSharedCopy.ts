/**
 * "Make a copy" on a shared workbook stores the workbook in localStorage and
 * reloads the app. On the next start this opens it as its own file, so the
 * work the visitor already has in the app is never replaced.
 */

import type { WorkbookData } from '@/types'
import { IMPORT_SHARED_KEY } from '@/lib/authKeys'
import { normalizeImportedWorkbook } from '@/io/workbookJson'

type Importer = (workbook: WorkbookData, meta: { fileName: string; asNewFile: true }) => void

/** Opens a pending shared copy as a new file. The saved copy is dropped once handled, or if it is unreadable. */
export function importSharedCopy(importWorkbook: Importer): void {
  let raw: string | null
  try {
    raw = localStorage.getItem(IMPORT_SHARED_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    const workbook = normalizeImportedWorkbook(JSON.parse(raw) as WorkbookData)
    importWorkbook(workbook, { fileName: workbook.name || 'Shared workbook', asNewFile: true })
  } catch {
    // Malformed saved copy: nothing to open.
  }
  try {
    localStorage.removeItem(IMPORT_SHARED_KEY)
  } catch {
    // storage unavailable
  }
}

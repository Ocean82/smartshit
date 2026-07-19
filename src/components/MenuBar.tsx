/**
 * MenuBar — Standard spreadsheet application menu.
 * File, Edit, View, Insert, Format, Data menus.
 */

import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { createEmptyWorkbook, refToCell } from '@/engine/spreadsheet'
import { exportWorkbookToXlsx, exportSheetToCsv, importWorkbookFromFileWithMeta } from '@/io/xlsx'
import { exportWorkbookToJson, importWorkbookFromJsonFile, normalizeImportedWorkbook } from '@/io/workbookJson'
import { v4 as uuid } from 'uuid'

type MenuId = 'file' | 'edit' | 'view' | 'insert' | 'format' | 'data' | null

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  dividerAfter?: boolean
  disabled?: boolean
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<MenuId>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)

  const {
    workbook,
    engine,
    undo,
    redo,
    undoStack,
    redoStack,
    copy,
    cut,
    paste,
    selection,
    deleteSelectedCells,
    pushHistory,
    toggleFileExplorer,
    showFileExplorer,
    showFormatPanel,
    setShowFormatPanel,
    showVersionHistory,
    setShowVersionHistory,
    setShowChartDialog,
    setShowFilterDialog,
    setShowConditionalFormatDialog,
    setShowValidationDialog,
    setShowPivotDialog,
    showAuditPanel,
    toggleAuditPanel,
    sortByColumn,
    initWorkbook,
    addMessage,
    getActiveSheet,
  } = useStore()

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu])

  // Close on Escape
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openMenu])

  const handleNewWorkbook = () => {
    if (Object.keys(getActiveSheet().cells).length > 0) {
      if (!confirm('Create a new workbook? Unsaved changes will be lost.')) return
    }
    initWorkbook('New Workbook')
    addMessage({
      id: uuid(),
      role: 'assistant',
      content: 'Started a fresh workbook. Try **"Create a monthly budget"** or import a file to get started.',
      timestamp: Date.now(),
    })
    setOpenMenu(null)
  }

  const handleOpen = () => {
    fileInputRef.current?.click()
    setOpenMenu(null)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      pushHistory('Open file')
      const { workbook: wb } = await importWorkbookFromFileWithMeta(file)
      useStore.getState().importWorkbook(wb, { fileName: file.name })
    } catch {
      addMessage({ id: uuid(), role: 'assistant', content: `Could not open **${file.name}**. Make sure it's a valid .xlsx or .csv file.`, timestamp: Date.now() })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = () => {
    exportWorkbookToXlsx(workbook)
    setOpenMenu(null)
  }

  const handleSaveAsCSV = () => {
    const sheet = getActiveSheet()
    exportSheetToCsv(sheet, workbook.name.replace(/\s+/g, '_'))
    setOpenMenu(null)
  }

  const handleBackupJson = () => {
    exportWorkbookToJson(workbook)
    setOpenMenu(null)
  }

  const handleRestoreJson = () => {
    jsonInputRef.current?.click()
    setOpenMenu(null)
  }

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      pushHistory('Restore JSON backup')
      const wb = normalizeImportedWorkbook(await importWorkbookFromJsonFile(file))
      useStore.getState().loadWorkbookData(wb)
      addMessage({
        id: uuid(),
        role: 'assistant',
        content: `Restored workbook from **${file.name}**.`,
        timestamp: Date.now(),
      })
    } catch (err) {
      addMessage({
        id: uuid(),
        role: 'assistant',
        content: `Could not restore **${file.name}**: ${err instanceof Error ? err.message : 'invalid backup'}.`,
        timestamp: Date.now(),
      })
    }
    if (jsonInputRef.current) jsonInputRef.current.value = ''
  }

  const handleRename = () => {
    const name = prompt('Workbook name:', workbook.name)
    if (name && name.trim()) {
      useStore.setState((s) => { s.workbook.name = name.trim() })
    }
    setOpenMenu(null)
  }

  const sheet = getActiveSheet()
  const col = selection ? Math.min(selection.startCol, selection.endCol) : 0

  const menus: Record<string, { label: string; items: MenuItem[] }> = {
    file: {
      label: 'File',
      items: [
        { label: 'New Workbook', shortcut: '', action: handleNewWorkbook },
        { label: 'Open...', shortcut: 'Ctrl+O', action: handleOpen, dividerAfter: true },
        { label: 'Rename', action: handleRename },
        { label: 'Save as Excel', shortcut: 'Ctrl+S', action: handleSave },
        { label: 'Save as CSV', action: handleSaveAsCSV },
        { label: 'Backup as JSON…', action: handleBackupJson },
        { label: 'Restore from JSON…', action: handleRestoreJson, dividerAfter: true },
        { label: 'Version History', action: () => { setShowVersionHistory(!showVersionHistory); setOpenMenu(null) } },
        { label: 'Share...', action: () => { document.dispatchEvent(new CustomEvent('smartsht:open-share')); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Print', shortcut: 'Ctrl+P', action: () => { window.print(); setOpenMenu(null) } },
      ],
    },
    edit: {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { undo(); setOpenMenu(null) }, disabled: undoStack.length === 0 },
        { label: 'Redo', shortcut: 'Ctrl+Y', action: () => { redo(); setOpenMenu(null) }, disabled: redoStack.length === 0, dividerAfter: true },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => { cut(); setOpenMenu(null) } },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => { copy(); setOpenMenu(null) } },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => { paste(); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Delete', shortcut: 'Del', action: () => { deleteSelectedCells(); setOpenMenu(null) }, disabled: !selection },
        { label: 'Find & Replace', shortcut: 'Ctrl+F', action: () => { setOpenMenu(null) } },
      ],
    },
    view: {
      label: 'View',
      items: [
        { label: showFileExplorer ? '✓ File Explorer' : '  File Explorer', action: () => { toggleFileExplorer(); setOpenMenu(null) } },
        { label: showFormatPanel ? '✓ Format Panel' : '  Format Panel', action: () => { setShowFormatPanel(!showFormatPanel); setOpenMenu(null) } },
        { label: showVersionHistory ? '✓ Version History' : '  Version History', action: () => { setShowVersionHistory(!showVersionHistory); setOpenMenu(null) } },
        { label: showAuditPanel ? '✓ Auditor' : '  Auditor', action: () => { toggleAuditPanel(); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Freeze Panes', action: () => { if (selection) { useStore.getState().setFreeze(selection.startRow, selection.startCol); } setOpenMenu(null) }, disabled: !selection },
        { label: 'Unfreeze Panes', action: () => { useStore.getState().setFreeze(0, 0); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Full Screen', shortcut: 'F11', action: () => { document.documentElement.requestFullscreen?.(); setOpenMenu(null) } },
      ],
    },
    insert: {
      label: 'Insert',
      items: [
        { label: 'Chart', action: () => { setShowChartDialog(true); setOpenMenu(null) } },
        { label: 'Pivot Table', action: () => { setShowPivotDialog(true); setOpenMenu(null) }, disabled: !selection, dividerAfter: true },
        { label: 'New Sheet', action: () => { useStore.getState().addSheet(); setOpenMenu(null) } },
      ],
    },
    format: {
      label: 'Format',
      items: [
        { label: 'Bold', shortcut: 'Ctrl+B', action: () => { useStore.getState().setRangeFormat({ bold: true }); setOpenMenu(null) } },
        { label: 'Italic', shortcut: 'Ctrl+I', action: () => { useStore.getState().setRangeFormat({ italic: true }); setOpenMenu(null) } },
        { label: 'Underline', shortcut: 'Ctrl+U', action: () => { useStore.getState().setRangeFormat({ underline: true }); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Conditional Formatting...', action: () => { setShowConditionalFormatDialog(true); setOpenMenu(null) } },
        { label: 'Data Validation...', action: () => { setShowValidationDialog(true); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Number Format Panel', action: () => { setShowFormatPanel(true); setOpenMenu(null) } },
      ],
    },
    data: {
      label: 'Data',
      items: [
        { label: 'Sort Ascending', action: () => { if (selection) { sortByColumn(col, 'asc'); } setOpenMenu(null) }, disabled: !selection },
        { label: 'Sort Descending', action: () => { if (selection) { sortByColumn(col, 'desc'); } setOpenMenu(null) }, disabled: !selection },
        { label: 'Filter...', action: () => { setShowFilterDialog(true); setOpenMenu(null) }, dividerAfter: true },
        { label: 'Data Validation...', action: () => { setShowValidationDialog(true); setOpenMenu(null) } },
        { label: 'Pivot Table...', action: () => { setShowPivotDialog(true); setOpenMenu(null) }, disabled: !selection },
      ],
    },
  }

  return (
    <div ref={menuRef} className="flex items-center bg-white border-b border-gray-200 px-1 h-7 text-xs relative z-50">
      {Object.entries(menus).map(([id, menu]) => (
        <div key={id} className="relative">
          <button
            type="button"
            onMouseDown={() => setOpenMenu(openMenu === id ? null : id as MenuId)}
            onMouseEnter={() => { if (openMenu) setOpenMenu(id as MenuId) }}
            className={`px-2.5 py-1 rounded text-gray-600 hover:bg-gray-100 transition-colors ${
              openMenu === id ? 'bg-gray-100 text-gray-900' : ''
            }`}
          >
            {menu.label}
          </button>

          {openMenu === id && (
            <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px] z-50">
              {menu.items.map((item, i) => (
                <div key={i}>
                  <button
                    type="button"
                    onClick={item.action}
                    disabled={item.disabled}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-4 ${
                      item.disabled
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="text-[10px] text-gray-400">{item.shortcut}</span>}
                  </button>
                  {item.dividerAfter && <div className="border-t border-gray-100 my-0.5" />}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleImportFile}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,.smartsht.json"
        className="hidden"
        onChange={handleImportJsonFile}
      />
    </div>
  )
}

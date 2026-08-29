/**
 * MenuBar — Standard spreadsheet application menu.
 * File, Edit, View, Insert, Format, Data menus.
 */

import React, { useState, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store/useStore'
import { exportWorkbookToXlsx, exportSheetToCsv, importWorkbookFromFileWithMeta } from '@/io/xlsx'
import { exportWorkbookToJson, importWorkbookFromJsonFile, normalizeImportedWorkbook } from '@/io/workbookJson'
import { workbookHasContent } from '@/lib/workbookGuard'
import { v4 as uuid } from 'uuid'
import { AnchoredPanel } from '@/components/AnchoredPanel'

type MenuId = 'file' | 'edit' | 'view' | 'insert' | 'format' | 'data'

const MENU_ORDER: MenuId[] = ['file', 'edit', 'view', 'insert', 'format', 'data']

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  dividerAfter?: boolean
  disabled?: boolean
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null)
  const triggerRefs = useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({})
  const activeTriggerRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)

  const {
    workbook,
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
    setShowFindReplace,
    activePanel,
    setActivePanel,
    sortByColumn,
    initWorkbook,
    addMessage,
    getActiveSheet,
    showConfirm,
    showToolbar,
    toggleToolbar,
  } = useStore(useShallow((s) => ({
    workbook: s.workbook,
    undo: s.undo,
    redo: s.redo,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
    copy: s.copy,
    cut: s.cut,
    paste: s.paste,
    selection: s.selection,
    deleteSelectedCells: s.deleteSelectedCells,
    pushHistory: s.pushHistory,
    toggleFileExplorer: s.toggleFileExplorer,
    showFileExplorer: s.showFileExplorer,
    showFormatPanel: s.showFormatPanel,
    setShowFormatPanel: s.setShowFormatPanel,
    showVersionHistory: s.showVersionHistory,
    setShowVersionHistory: s.setShowVersionHistory,
    setShowChartDialog: s.setShowChartDialog,
    setShowFilterDialog: s.setShowFilterDialog,
    setShowConditionalFormatDialog: s.setShowConditionalFormatDialog,
    setShowValidationDialog: s.setShowValidationDialog,
    setShowPivotDialog: s.setShowPivotDialog,
    setShowFindReplace: s.setShowFindReplace,
    activePanel: s.activePanel,
    setActivePanel: s.setActivePanel,
    sortByColumn: s.sortByColumn,
    initWorkbook: s.initWorkbook,
    addMessage: s.addMessage,
    getActiveSheet: s.getActiveSheet,
    showConfirm: s.showConfirm,
    showToolbar: s.showToolbar,
    toggleToolbar: s.toggleToolbar,
  })))

  const closeMenu = useCallback(() => setOpenMenu(null), [])

  const openMenuId = useCallback((id: MenuId) => {
    activeTriggerRef.current = triggerRefs.current[id] ?? null
    setOpenMenu(id)
  }, [])

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const focusItem = useCallback((index: number) => {
    itemRefs.current[index]?.focus()
  }, [])

  const navigateMenu = useCallback((next: MenuId) => {
    openMenuId(next)
    triggerRefs.current[next]?.focus()
  }, [openMenuId])

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, id: MenuId) => {
    const idx = MENU_ORDER.indexOf(id)
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      navigateMenu(MENU_ORDER[(idx + 1) % MENU_ORDER.length])
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      navigateMenu(MENU_ORDER[(idx - 1 + MENU_ORDER.length) % MENU_ORDER.length])
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      if (openMenu !== id) {
        e.preventDefault()
        openMenuId(id)
      }
      // Defer so the menu items are mounted before focusing one of them.
      setTimeout(() => focusItem(e.key === 'ArrowUp' ? openMenuItemsRef.current.length - 1 : 0), 0)
    } else if (e.key === 'Escape') {
      setOpenMenu(null)
    }
  }, [openMenu, openMenuId, navigateMenu, focusItem])

  const handleItemKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const items = openMenuItemsRef.current
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem((index + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem((index - 1 + items.length) % items.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(items.length - 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      navigateMenu(MENU_ORDER[(MENU_ORDER.indexOf(currentMenuIdRef.current) - 1 + MENU_ORDER.length) % MENU_ORDER.length])
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      navigateMenu(MENU_ORDER[(MENU_ORDER.indexOf(currentMenuIdRef.current) + 1) % MENU_ORDER.length])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpenMenu(null)
      triggerRefs.current[currentMenuIdRef.current]?.focus()
    } else if (e.key === 'Tab') {
      // WAI-ARIA menubar: Tab dismisses the open menu.
      setOpenMenu(null)
    }
  }, [navigateMenu, focusItem])

  const currentMenuIdRef = useRef<MenuId>('file')
  const openMenuItemsRef = useRef<MenuItem[]>([])

  const toggleMenu = useCallback((id: MenuId) => {
    if (openMenu === id) {
      setOpenMenu(null)
      return
    }
    openMenuId(id)
  }, [openMenu, openMenuId])

  const handleNewWorkbook = () => {
    const doCreate = () => {
      initWorkbook('New Workbook')
      addMessage({
        id: uuid(),
        role: 'assistant',
        content: 'Started a fresh workbook. Try **"Create a monthly budget"** or import a file to get started.',
        timestamp: Date.now(),
      })
      setOpenMenu(null)
    }

    if (Object.keys(getActiveSheet().cells).length > 0) {
      showConfirm({
        title: 'New workbook',
        message: 'This will replace the current workbook with a new, blank workbook. Undo history will be cleared.',
        confirmLabel: 'Create new',
        variant: 'warning',
        onConfirm: doCreate,
      })
    } else {
      doCreate()
    }
  }

  const handleOpen = () => {
    const proceed = () => fileInputRef.current?.click()
    if (workbookHasContent(useStore.getState().workbook)) {
      showConfirm({
        title: 'Open file',
        message:
          'Opening a file will replace the current workbook and clear undo history. This cannot be undone.',
        confirmLabel: 'Open file',
        variant: 'warning',
        onConfirm: proceed,
      })
    } else {
      proceed()
    }
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
    const proceed = () => jsonInputRef.current?.click()
    if (workbookHasContent(useStore.getState().workbook)) {
      showConfirm({
        title: 'Restore from backup',
        message:
          'Restoring a backup will replace the current workbook. This cannot be undone.',
        confirmLabel: 'Restore',
        variant: 'warning',
        onConfirm: proceed,
      })
    } else {
      proceed()
    }
    setOpenMenu(null)
  }

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const wb = normalizeImportedWorkbook(await importWorkbookFromJsonFile(file))
      // Snapshot the current workbook so the restore is reversible with Ctrl+Z.
      useStore.getState().loadWorkbookData(wb, { pushUndo: true })
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

  const col = selection ? Math.min(selection.startCol, selection.endCol) : 0

  const menus: Record<MenuId, { label: string; items: MenuItem[] }> = {
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
        { label: 'Find & Replace', shortcut: 'Ctrl+F', action: () => { setShowFindReplace(true); setOpenMenu(null) } },
      ],
    },
    view: {
      label: 'View',
      items: [
        { label: showToolbar ? '✓ Toolbar' : '  Toolbar', shortcut: 'Ctrl+Shift+T', action: () => { toggleToolbar(); setOpenMenu(null) } },
        { label: showFileExplorer ? '✓ File Explorer' : '  File Explorer', action: () => { toggleFileExplorer(); setOpenMenu(null) } },
        { label: showFormatPanel ? '✓ Format Panel' : '  Format Panel', action: () => { setShowFormatPanel(!showFormatPanel); setOpenMenu(null) } },
        { label: showVersionHistory ? '✓ Version History' : '  Version History', action: () => { setShowVersionHistory(!showVersionHistory); setOpenMenu(null) } },
        { label: activePanel === 'auditor' ? '✓ Auditor' : '  Auditor', action: () => { setActivePanel(activePanel === 'auditor' ? null : 'auditor'); setOpenMenu(null) }, dividerAfter: true },
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
      ],
    },
  }

  const openItems = openMenu ? menus[openMenu].items : []
  openMenuItemsRef.current = openItems
  currentMenuIdRef.current = openMenu ?? 'file'

  return (
    <nav className="flex items-center gap-0.5 text-[11px] relative z-50" aria-label="Application">
      {(Object.entries(menus) as Array<[MenuId, { label: string; items: MenuItem[] }]>).map(([id, menu]) => {
        const panelId = `menubar-panel-${id}`
        return (
          <div key={id} className="relative">
            <button
              type="button"
              ref={(el) => { triggerRefs.current[id] = el }}
              aria-expanded={openMenu === id}
              aria-controls={openMenu === id ? panelId : undefined}
              aria-haspopup="menu"
              onMouseDown={(e) => {
                // Keep the button from stealing focus so the click toggles feel native.
                e.preventDefault()
              }}
              onClick={() => toggleMenu(id)}
              onKeyDown={(e) => handleTriggerKeyDown(e, id)}
              onMouseEnter={() => {
                if (openMenu && openMenu !== id) openMenuId(id)
              }}
              className={`px-2 py-1 rounded transition-colors ${
                openMenu === id ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {menu.label}
            </button>
          </div>
        )
      })}

      <AnchoredPanel
        open={openMenu !== null}
        onClose={closeMenu}
        anchorRef={activeTriggerRef}
        width={220}
        maxHeight={360}
        id={openMenu ? `menubar-panel-${openMenu}` : undefined}
        aria-label={openMenu ? `${menus[openMenu].label} actions` : undefined}
        className="bg-white border border-gray-200 rounded-lg shadow-xl py-1"
      >
        {openItems.map((item, i) => (
          <div key={`${item.label}-${i}`}>
            <button
              ref={(el) => { itemRefs.current[i] = el }}
              type="button"
              onClick={item.action}
              onKeyDown={(e) => handleItemKeyDown(e, i)}
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
      </AnchoredPanel>

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
    </nav>
  )
}

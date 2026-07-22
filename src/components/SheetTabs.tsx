import { useState, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Plus, X, Edit3, Check } from 'lucide-react';

export function SheetTabs() {
  const {
    workbook,
    activeSheetId,
    setActiveSheet,
    addSheet,
    deleteSheet,
    renameSheet,
    showConfirm,
    showToast,
    undo,
  } = useStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleStartRename = (sheetId: string, currentName: string) => {
    setRenamingId(sheetId);
    setRenameValue(currentName);
  };

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) {
      renameSheet(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  // Arrow key navigation between tabs
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    const sheets = workbook.sheets;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextIndex = e.key === 'ArrowRight'
        ? (index + 1) % sheets.length
        : (index - 1 + sheets.length) % sheets.length;
      setActiveSheet(sheets[nextIndex].id);
      // Focus the new active tab
      const tabs = tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[nextIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveSheet(sheets[0].id);
      const tabs = tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveSheet(sheets[sheets.length - 1].id);
      const tabs = tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
      tabs?.[sheets.length - 1]?.focus();
    }
  }, [workbook.sheets, setActiveSheet]);

  return (
    <div
      className="border-t border-gray-200 flex items-center px-2 h-8 overflow-x-auto shrink-0"
      ref={tabsRef}
      role="tablist"
      aria-label="Sheet tabs"
      style={{ background: 'var(--surface-secondary)' }}
    >
      {workbook.sheets.map((sheet, index) => (
        <div
          key={sheet.id}
          role="tab"
          aria-selected={sheet.id === activeSheetId}
          aria-label={sheet.name}
          tabIndex={sheet.id === activeSheetId ? 0 : -1}
          className={`flex items-center gap-1 px-3 py-1 text-[11px] font-medium cursor-pointer transition-colors group ${
            sheet.id === activeSheetId
              ? 'rounded-t-md border border-b-white -mb-px shadow-sm'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md'
          }`}
          style={sheet.id === activeSheetId
            ? { background: 'var(--surface-panel)', borderColor: 'var(--neutral-200)', color: 'var(--accent-700)' }
            : undefined
          }
          onClick={() => setActiveSheet(sheet.id)}
          onDoubleClick={() => handleStartRename(sheet.id, sheet.name)}
          onKeyDown={(e) => handleTabKeyDown(e, index)}
        >
          {renamingId === sheet.id ? (
            <div className="flex items-center gap-1">
              <input
                className="w-24 text-xs px-1 py-0 border border-blue-300 rounded outline-none"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleFinishRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                autoFocus
              />
              <button onClick={handleFinishRename} className="text-green-600 hover:text-green-700">
                <Check size={12} />
              </button>
            </div>
          ) : (
            <>
              <span>{sheet.name}</span>
              <button
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(sheet.id, sheet.name);
                }}
              >
                <Edit3 size={10} />
              </button>
              {workbook.sheets.length > 1 && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    const sheetName = sheet.name;
                    showConfirm({
                      title: 'Delete sheet',
                      message: `"${sheetName}" and all its data will be permanently removed.`,
                      confirmLabel: 'Delete',
                      variant: 'danger',
                      onConfirm: () => {
                        deleteSheet(sheet.id);
                        showToast({
                          type: 'success',
                          message: `Deleted "${sheetName}"`,
                          undoAction: undo,
                        });
                      },
                    });
                  }}
                  aria-label={`Delete sheet ${sheet.name}`}
                >
                  <X size={12} />
                </button>
              )}
            </>
          )}
        </div>
      ))}
      <button
        className="p-1 ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
        onClick={() => addSheet()}
        title="Add Sheet"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

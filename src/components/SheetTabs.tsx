import { useState } from 'react';
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
  } = useStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  return (
    <div className="bg-gray-50 border-t border-gray-200 flex items-center px-2 h-9 overflow-x-auto">
      {workbook.sheets.map((sheet) => (
        <div
          key={sheet.id}
          className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-t cursor-pointer transition-colors border-b-2 group ${
            sheet.id === activeSheetId
              ? 'bg-white text-blue-700 border-blue-500 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 border-transparent'
          }`}
          onClick={() => setActiveSheet(sheet.id)}
          onDoubleClick={() => handleStartRename(sheet.id, sheet.name)}
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
                    deleteSheet(sheet.id);
                  }}
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

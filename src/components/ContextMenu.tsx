import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { cellToRef } from '@/engine/spreadsheet';
import {
  Copy, Scissors, ClipboardPaste, Trash2, Plus,
  ArrowDown, ArrowRight, Bold, Italic,
} from 'lucide-react';

export function ContextMenu() {
  const {
    contextMenu,
    setContextMenu,
    copy,
    cut,
    paste,
    pushHistory,
    insertRow,
    insertColumn,
    deleteRow,
    deleteColumn,
    setRangeFormat,
    setCellValue,
  } = useStore();

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const ref = cellToRef(contextMenu.cell);

  const menuItems = [
    { icon: <Copy size={13} />, label: 'Copy', shortcut: 'Ctrl+C', action: () => { copy(); } },
    { icon: <Scissors size={13} />, label: 'Cut', shortcut: 'Ctrl+X', action: () => { cut(); } },
    { icon: <ClipboardPaste size={13} />, label: 'Paste', shortcut: 'Ctrl+V', action: () => { paste(); } },
    null, // divider
    { icon: <Plus size={13} />, label: 'Insert Row Below', action: () => { pushHistory('Insert row'); insertRow(ref.row); } },
    { icon: <ArrowDown size={13} />, label: 'Insert Column Right', action: () => { pushHistory('Insert column'); insertColumn(ref.col); } },
    null,
    { icon: <Trash2 size={13} />, label: 'Delete Row', action: () => { pushHistory('Delete row'); deleteRow(ref.row); } },
    { icon: <ArrowRight size={13} />, label: 'Delete Column', action: () => { pushHistory('Delete column'); deleteColumn(ref.col); } },
    null,
    { icon: <Bold size={13} />, label: 'Bold', shortcut: 'Ctrl+B', action: () => { setRangeFormat({ bold: true }); } },
    { icon: <Italic size={13} />, label: 'Italic', shortcut: 'Ctrl+I', action: () => { setRangeFormat({ italic: true }); } },
    null,
    { icon: <Trash2 size={13} />, label: 'Clear Cell', action: () => { pushHistory('Clear'); setCellValue(contextMenu.cell, null); } },
  ];

  return (
    <div
      className="fixed bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 min-w-[200px] overflow-hidden"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <div className="px-3 py-1 text-[10px] text-gray-400 font-mono">
        {contextMenu.cell}
      </div>
      {menuItems.map((item, i) => {
        if (!item) {
          return <div key={i} className="border-t border-gray-100 my-1" />;
        }
        return (
          <button
            key={i}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            onClick={item.action}
          >
            <span className="text-gray-400">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-gray-400">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

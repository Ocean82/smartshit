import { useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  File, Folder, FolderPlus, FilePlus, Trash2, Edit3,
  ChevronRight, ChevronDown, X,
} from 'lucide-react';

export function FileExplorer() {
  const {
    files,
    activeFileId,
    showFileExplorer,
    toggleFileExplorer,
    createFile,
    createFolder,
    deleteFile,
    renameFile,
    openFile,
  } = useStore();

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewInput, setShowNewInput] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');

  if (!showFileExplorer) return null;

  const rootFiles = files.filter((f) => f.parentId === null);

  const handleToggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateNew = () => {
    if (!newName.trim()) {
      setShowNewInput(null);
      return;
    }
    if (showNewInput === 'file') {
      createFile(newName.trim());
    } else {
      createFolder(newName.trim());
    }
    setNewName('');
    setShowNewInput(null);
  };

  const handleStartRename = (id: string, name: string) => {
    setRenamingId(id);
    setRenameValue(name);
  };

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) {
      renameFile(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="w-56 border-r border-gray-200 flex flex-col bg-white shrink-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Files</h3>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            onClick={() => setShowNewInput('file')}
            title="New File"
          >
            <FilePlus size={14} />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            onClick={() => setShowNewInput('folder')}
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            onClick={toggleFileExplorer}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {showNewInput && (
          <div className="px-2 py-1">
            <div className="flex items-center gap-1">
              {showNewInput === 'folder' ? (
                <Folder size={14} className="text-amber-500 shrink-0" />
              ) : (
                <File size={14} className="text-blue-500 shrink-0" />
              )}
              <input
                className="flex-1 text-xs px-1.5 py-0.5 border border-blue-300 rounded outline-none"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={handleCreateNew}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNew();
                  if (e.key === 'Escape') setShowNewInput(null);
                }}
                placeholder={showNewInput === 'folder' ? 'Folder name...' : 'File name...'}
                autoFocus
              />
            </div>
          </div>
        )}
        {rootFiles.map((file) => (
          <FileItem
            key={file.id}
            file={file}
            files={files}
            activeFileId={activeFileId}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onOpen={openFile}
            onDelete={deleteFile}
            onStartRename={handleStartRename}
            renamingId={renamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onFinishRename={handleFinishRename}
            depth={0}
          />
        ))}
      </div>

      {/* Storage info */}
      <div className="px-3 py-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>{files.filter(f => f.type === 'file').length} files</span>
          <span>Local storage</span>
        </div>
      </div>
    </div>
  );
}

function FileItem({
  file,
  files,
  activeFileId,
  expandedFolders,
  onToggleFolder,
  onOpen,
  onDelete,
  onStartRename,
  renamingId,
  renameValue,
  setRenameValue,
  onFinishRename,
  depth,
}: {
  file: { id: string; name: string; type: string };
  files: { id: string; name: string; type: string; parentId: string | null }[];
  activeFileId: string | null;
  expandedFolders: Set<string>;
  onToggleFolder: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onStartRename: (id: string, name: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onFinishRename: () => void;
  depth: number;
}) {
  const isFolder = file.type === 'folder';
  const isExpanded = expandedFolders.has(file.id);
  const isActive = file.id === activeFileId;
  const children = files.filter((f) => f.parentId === file.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer group text-xs transition-colors ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isFolder) onToggleFolder(file.id);
          else onOpen(file.id);
        }}
      >
        {isFolder && (
          isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
        )}
        {isFolder ? (
          <Folder size={14} className="text-amber-500 shrink-0" />
        ) : (
          <File size={14} className="text-blue-500 shrink-0" />
        )}

        {renamingId === file.id ? (
          <input
            className="flex-1 text-xs px-1 py-0 border border-blue-300 rounded outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={onFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onFinishRename();
            }}
            autoFocus
          />
        ) : (
          <span className="flex-1 truncate">{file.name}</span>
        )}

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
          <button
            className="p-0.5 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(file.id, file.name);
            }}
          >
            <Edit3 size={10} />
          </button>
          <button
            className="p-0.5 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file.id);
            }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      {isFolder && isExpanded && children.map((child) => (
        <FileItem
          key={child.id}
          file={child}
          files={files}
          activeFileId={activeFileId}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onOpen={onOpen}
          onDelete={onDelete}
          onStartRename={onStartRename}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onFinishRename={onFinishRename}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

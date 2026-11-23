import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { useShallow } from 'zustand/react/shallow';
import {
  File, Folder, FolderPlus, FilePlus, Trash2, Edit3,
  ChevronRight, ChevronDown, X, Undo2, FolderInput,
} from 'lucide-react';
import { TRASH_TTL_MS, canMoveFile, moveTargets } from '@/lib/fileWorkbooks';
import { loadExpandedFolders, saveExpandedFolders } from '@/lib/expandedFolders';
import type { FileItem as FileEntry } from '@/types';
import { MOBILE_PANEL_BELOW_TITLEBAR } from '@/components/panels/dockPanelLayout';

const DAY_MS = 24 * 60 * 60 * 1000;

const ROOT_DROP = '__root__';

/** What each row needs to take part in drag-and-drop and the move menu. */
interface TreeActions {
  dragId: string | null;
  setDragId: (id: string | null) => void;
  dropTargetId: string | null;
  setDropTargetId: (id: string | null) => void;
  canMove: (id: string, parentId: string | null) => boolean;
  onMove: (id: string, parentId: string | null) => void;
  moveOptions: (id: string) => { id: string; name: string }[];
  movingId: string | null;
  setMovingId: (id: string | null) => void;
  onNewIn: (folderId: string) => void;
}

/** Days until a trashed item is deleted for good. */
function trashDaysLeft(item: FileEntry): number {
  return Math.max(0, Math.ceil(((item.deletedAt ?? 0) + TRASH_TTL_MS - Date.now()) / DAY_MS));
}

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
    moveFile,
    restoreFile,
    deleteFileForever,
    emptyTrash,
    showConfirm,
  } = useStore(
    useShallow((s) => ({
      files: s.files,
      activeFileId: s.activeFileId,
      showFileExplorer: s.showFileExplorer,
      toggleFileExplorer: s.toggleFileExplorer,
      createFile: s.createFile,
      createFolder: s.createFolder,
      deleteFile: s.deleteFile,
      renameFile: s.renameFile,
      openFile: s.openFile,
      moveFile: s.moveFile,
      restoreFile: s.restoreFile,
      deleteFileForever: s.deleteFileForever,
      emptyTrash: s.emptyTrash,
      showConfirm: s.showConfirm,
    })),
  );

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(loadExpandedFolders);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewInput, setShowNewInput] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  // Remember which folders are open across reloads. Skips the first render: the file list may
  // still be hydrating then, and saving would prune folders that exist but are not loaded yet.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveExpandedFolders(expandedFolders, useStore.getState().files.map((f) => f.id));
  }, [expandedFolders]);

  // Close the full-screen mobile drawer with Escape (desktop is an inline sidebar).
  useEffect(() => {
    if (!showFileExplorer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.matchMedia('(max-width: 767px)').matches) {
        toggleFileExplorer();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showFileExplorer, toggleFileExplorer]);

  if (!showFileExplorer) return null;

  const liveFiles = files.filter((f) => f.deletedAt === undefined);
  const rootFiles = liveFiles.filter((f) => f.parentId === null);
  // Items taken along with a trashed folder come back with it, so only list the top level.
  const trashed = files.filter((f) => f.deletedAt !== undefined && f.trashedWith === undefined);
  const fileCount = liveFiles.filter((f) => f.type === 'file').length;

  const handleToggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startNew = (kind: 'file' | 'folder', parentId: string | null = null) => {
    setShowNewInput(kind);
    setNewParentId(parentId);
    if (parentId) setExpandedFolders((prev) => new Set(prev).add(parentId));
  };

  const handleCreateNew = () => {
    if (!newName.trim()) {
      setShowNewInput(null);
      return;
    }
    if (showNewInput === 'file') {
      createFile(newName.trim(), newParentId);
    } else {
      createFolder(newName.trim(), newParentId);
    }
    setNewName('');
    setShowNewInput(null);
    setNewParentId(null);
  };

  const tree: TreeActions = {
    dragId,
    setDragId,
    dropTargetId,
    setDropTargetId,
    canMove: (id, parentId) => canMoveFile(liveFiles, id, parentId),
    onMove: (id, parentId) => {
      moveFile(id, parentId);
      if (parentId) setExpandedFolders((prev) => new Set(prev).add(parentId));
      setMovingId(null);
      setDragId(null);
      setDropTargetId(null);
    },
    moveOptions: (id) => moveTargets(liveFiles, id).map((f) => ({ id: f.id, name: f.name })),
    movingId,
    setMovingId,
    onNewIn: (folderId) => startNew('file', folderId),
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

  const handleDelete = (id: string) => {
    const target = files.find((f) => f.id === id);
    const contained = files.filter((f) => f.parentId === id && f.deletedAt === undefined).length;
    showConfirm({
      title: target?.type === 'folder' ? 'Delete folder' : 'Delete file',
      message: `"${target?.name || 'this file'}"${contained ? ` and the ${contained} item${contained === 1 ? '' : 's'} in it` : ''} will move to Trash. You can restore ${contained ? 'them' : 'it'} for 30 days.`,
      confirmLabel: 'Move to Trash',
      variant: 'warning',
      onConfirm: () => deleteFile(id),
    });
  };

  const handleDeleteForever = (id: string) => {
    const target = files.find((f) => f.id === id);
    showConfirm({
      title: 'Delete forever',
      message: `"${target?.name || 'This item'}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      variant: 'danger',
      onConfirm: () => deleteFileForever(id),
    });
  };

  const handleEmptyTrash = () => {
    showConfirm({
      title: 'Empty Trash',
      message: `Everything in Trash (${trashed.length} item${trashed.length === 1 ? '' : 's'}) will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      variant: 'danger',
      onConfirm: emptyTrash,
    });
  };

  return (
    <div className={`w-56 border-r border-gray-200 flex flex-col bg-white shrink-0 max-md:w-full ${MOBILE_PANEL_BELOW_TITLEBAR}`}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between" style={{ background: 'var(--accent-50)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-700)' }}>Files</h3>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--neutral-400)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-600)'; e.currentTarget.style.background = 'var(--accent-50)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--neutral-400)'; e.currentTarget.style.background = '' }}
            onClick={() => startNew('file')}
            title="New File"
          >
            <FilePlus size={14} />
          </button>
          <button
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--neutral-400)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-600)'; e.currentTarget.style.background = 'var(--accent-50)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--neutral-400)'; e.currentTarget.style.background = '' }}
            onClick={() => startNew('folder')}
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button
            className="p-1 max-md:p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            onClick={toggleFileExplorer}
            aria-label="Close files"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* File list */}
      <div
        className={`flex-1 overflow-y-auto py-1 ${dropTargetId === ROOT_DROP ? 'bg-blue-50/60' : ''}`}
        onDragOver={(e) => {
          if (dragId && tree.canMove(dragId, null)) {
            e.preventDefault();
            setDropTargetId(ROOT_DROP);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDropTargetId(null);
        }}
        onDrop={(e) => {
          if (dragId && tree.canMove(dragId, null)) {
            e.preventDefault();
            tree.onMove(dragId, null);
          }
        }}
      >
        {showNewInput && (
          <div className="px-2 py-1">
            {newParentId && (
              <p className="text-[10px] text-gray-400 mb-0.5 truncate">
                In “{files.find((f) => f.id === newParentId)?.name}”
              </p>
            )}
            <div className="flex items-center gap-1">
              {showNewInput === 'folder' ? (
                <Folder size={14} className="text-amber-500 shrink-0" />
              ) : (
                <File size={14} className="text-blue-500 shrink-0" />
              )}
              <input
                aria-label={showNewInput === 'folder' ? 'New folder name' : 'New file name'}
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
            files={liveFiles}
            activeFileId={activeFileId}
            expandedFolders={expandedFolders}
            onToggleFolder={handleToggleFolder}
            onOpen={openFile}
            onDelete={handleDelete}
            onStartRename={handleStartRename}
            renamingId={renamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onFinishRename={handleFinishRename}
            tree={tree}
            depth={0}
          />
        ))}
      </div>

      {/* Trash */}
      {trashed.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            type="button"
            className="w-full flex items-center gap-1.5 px-3 py-2 max-md:py-2.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-50"
            onClick={() => setShowTrash((v) => !v)}
            aria-expanded={showTrash}
          >
            {showTrash ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Trash2 size={12} />
            Trash ({trashed.length})
          </button>
          {showTrash && (
            <div className="max-h-48 overflow-y-auto pb-1">
              {trashed.map((item) => (
                <div key={item.id} className="flex items-center gap-1 px-3 py-1 max-md:py-1.5 text-xs text-gray-500">
                  {item.type === 'folder' ? (
                    <Folder size={14} className="text-amber-300 shrink-0" />
                  ) : (
                    <File size={14} className="text-blue-300 shrink-0" />
                  )}
                  <span className="flex-1 truncate" title={item.name}>{item.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0" title="Time left before it is deleted for good">
                    {trashDaysLeft(item)}d
                  </span>
                  <button
                    type="button"
                    className="p-0.5 max-md:p-2 hover:text-blue-600"
                    onClick={() => restoreFile(item.id)}
                    title="Restore"
                    aria-label={`Restore ${item.name}`}
                  >
                    <Undo2 size={12} />
                  </button>
                  <button
                    type="button"
                    className="p-0.5 max-md:p-2 hover:text-red-600"
                    onClick={() => handleDeleteForever(item.id)}
                    title="Delete forever"
                    aria-label={`Delete ${item.name} forever`}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="mx-3 mt-1 text-[11px] font-medium text-red-600 hover:underline"
                onClick={handleEmptyTrash}
              >
                Empty Trash
              </button>
            </div>
          )}
        </div>
      )}

      {/* Storage info */}
      <div className="px-3 py-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-[10px] text-gray-400">
          <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
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
  tree,
  depth,
}: {
  file: { id: string; name: string; type: string; parentId: string | null };
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
  tree: TreeActions;
  depth: number;
}) {
  const isFolder = file.type === 'folder';
  const isExpanded = expandedFolders.has(file.id);
  const isActive = file.id === activeFileId;
  const children = files.filter((f) => f.parentId === file.id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 max-md:py-2.5 cursor-pointer group text-xs transition-colors ${
          tree.dropTargetId === file.id
            ? 'bg-blue-100 ring-1 ring-blue-300 text-blue-700'
            : isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
        } ${tree.dragId === file.id ? 'opacity-50' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        draggable={renamingId !== file.id}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', file.id);
          e.dataTransfer.effectAllowed = 'move';
          tree.setDragId(file.id);
        }}
        onDragEnd={() => {
          tree.setDragId(null);
          tree.setDropTargetId(null);
        }}
        // A row never lets a drag fall through to the list: only blank space means "top level".
        onDragOver={(e) => {
          if (!tree.dragId) return;
          e.stopPropagation();
          if (isFolder && tree.canMove(tree.dragId, file.id)) {
            e.preventDefault();
            tree.setDropTargetId(file.id);
          }
        }}
        onDragLeave={() => {
          if (tree.dropTargetId === file.id) tree.setDropTargetId(null);
        }}
        onDrop={(e) => {
          if (!tree.dragId) return;
          e.stopPropagation();
          if (isFolder && tree.canMove(tree.dragId, file.id)) {
            e.preventDefault();
            tree.onMove(tree.dragId, file.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isFolder ? isExpanded : undefined}
        onClick={() => {
          if (isFolder) onToggleFolder(file.id);
          else onOpen(file.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isFolder) onToggleFolder(file.id);
            else onOpen(file.id);
          }
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
            aria-label={`Rename ${isFolder ? 'folder' : 'file'}`}
          />
        ) : (
          <span className="flex-1 truncate">{file.name}</span>
        )}

        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100 flex items-center gap-0.5">
          {isFolder && (
            <button
              className="p-0.5 max-md:p-2 hover:text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                tree.onNewIn(file.id);
              }}
              title="New file in this folder"
              aria-label={`New file in ${file.name}`}
            >
              <FilePlus size={10} />
            </button>
          )}
          <button
            className="p-0.5 max-md:p-2 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              tree.setMovingId(tree.movingId === file.id ? null : file.id);
            }}
            title="Move to a folder"
            aria-label={`Move ${file.name}`}
            aria-expanded={tree.movingId === file.id}
          >
            <FolderInput size={10} />
          </button>
          <button
            className="p-0.5 max-md:p-2 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename(file.id, file.name);
            }}
            title="Rename"
            aria-label={`Rename ${file.name}`}
          >
            <Edit3 size={10} />
          </button>
          <button
            className="p-0.5 max-md:p-2 hover:text-red-600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file.id);
            }}
            title="Delete"
            aria-label={`Delete ${file.name}`}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>
      {tree.movingId === file.id && (
        <div className="px-2 py-1" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
          <select
            className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 bg-white"
            aria-label={`Move ${file.name} to`}
            autoFocus
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) tree.onMove(file.id, e.target.value === ROOT_DROP ? null : e.target.value);
            }}
            onBlur={() => tree.setMovingId(null)}
          >
            <option value="" disabled>Move to…</option>
            {file.parentId !== null && <option value={ROOT_DROP}>Top level</option>}
            {tree.moveOptions(file.id).filter((o) => o.id !== file.parentId).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}
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
          tree={tree}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

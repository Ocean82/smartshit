/**
 * Component Prop Types
 *
 * Types for component props that don't fit neatly in domain/ui/api.
 * Keeps component-specific interfaces organized.
 */

import type { CellData, CellFormat, ChartConfig } from './domain';
import type { ChatMessage } from './api';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react';

/** Grid cell rendering props */
export interface GridCellProps {
  row: number;
  col: number;
  cellId: string;
  cellData: CellData | undefined;
  computed: string;
  colWidth: number;
  cellHeight: number;
  isEditing: boolean;
  isActive: boolean;
  isSelected: boolean;
  isCrosshair: boolean;
  editValue: string;
  hasNote: boolean;
  noteText: string;
  pendingChange: PendingCellChange | null;
  dataBarPeers: number[];
  colorScalePeers: number[];
  iconSetPeers: number[];
  getCellStyle: (format: CellFormat | undefined, cellValue?: string | number | boolean | null) => CSSProperties;
  colOffset: number;
  editContainerRef?: Ref<HTMLDivElement>;
  inputRef?: Ref<HTMLInputElement>;
  onMouseDown: (row: number, col: number, e: MouseEvent) => void;
  onMouseMove: (row: number, col: number) => void;
  onDoubleClick: (row: number, col: number) => void;
  onContextMenu: (e: MouseEvent, row: number, col: number) => void;
  onEditChange: (val: string) => void;
  onEditBlur: () => void;
  onCheckboxToggle: (cellId: string, cellData: CellData) => void;
}

export interface PendingCellChange {
  oldValue?: unknown;
  oldFormula?: string;
  newValue?: unknown;
  newFormula?: string;
}

/** Formula autocomplete props */
export interface FormulaAutocompleteProps {
  visible: boolean;
  editValue: string;
  onSelect: (functionName: string) => void;
  position: { top: number; left: number };
}

/** Find & replace dialog props */
export interface FindReplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Filter dialog props */
export interface FilterDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Conditional format dialog props */
export interface ConditionalFormatDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Pivot dialog props */
export interface PivotDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Validation dialog props */
export interface ValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Chart dialog props */
export interface ChartDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Chart overlay props */
export interface ChartOverlayProps {
  chart: ChartConfig;
  onRemove: (chartId: string) => void;
}

/** Context menu props */
export interface ContextMenuProps {
  contextMenu: { x: number; y: number; cell: string } | null;
  onClose: () => void;
}

/** Toast notification props */
export interface ToastProps {
  toast: {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    action?: { label: string; onClick: () => void };
    duration?: number;
    undoAction?: () => void;
  };
  onDismiss: (id: string) => void;
}

/** Confirm dialog props */
export interface ConfirmDialogProps {
  dialog: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'primary' | 'secondary';
    onConfirm: () => void;
    onCancel?: () => void;
  };
  onDismiss: () => void;
}

/** Panel rail props */
export interface PanelRailProps {
  activePanel: 'chat' | 'insights' | 'auditor' | 'inspector' | null;
  onToggle: (panel: 'chat' | 'insights' | 'auditor' | 'inspector') => void;
}

/** Dock panel props */
export interface DockPanelProps {
  panelId: 'chat' | 'insights' | 'auditor' | 'inspector';
  children: ReactNode;
  title?: string;
  headerActions?: ReactNode;
}

/** Sheet tabs props */
export interface SheetTabsProps {
  sheets: Array<{ id: string; name: string }>;
  activeSheetId: string;
  onSetActiveSheet: (id: string) => void;
  onAddSheet: (name?: string) => void;
  onDeleteSheet: (id: string) => void;
  onRenameSheet: (id: string, name: string) => void;
}

/** Formula bar props */
export interface FormulaBarProps {
  cellRef: string;
  cellContent: string;
  isEditing: boolean;
  onBarClick: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

/** Chat panel props */
export interface ChatPanelProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  embedded?: boolean;
}

/** Chat message props */
export interface ChatMessageProps {
  message: ChatMessage;
  onApplyAction: (actionId: string) => void;
  onRejectAction: (actionId: string) => void;
  onFeedback: (messageId: string, rating: 'up' | 'down') => void;
  onPin: (messageId: string) => void;
  onCopy: (text: string) => void;
  onDownload: () => void;
}

/** Skill chip props */
export interface SkillChipProps {
  skill: {
    id: string;
    name: string;
    description: string;
    icon: string;
    prompt?: string;
  };
  onClick: () => void;
  disabled?: boolean;
}

/** File explorer props */
export interface FileExplorerProps {
  files: Array<{
    id: string;
    name: string;
    type: 'file' | 'folder';
    parentId: string | null;
    workbookId?: string;
    children?: string[];
    createdAt: number;
    updatedAt: number;
  }>;
  activeFileId: string | null;
  onOpenFile: (id: string) => void;
  onCreateFile: (name: string, parentId?: string | null) => void;
  onCreateFolder: (name: string, parentId?: string | null) => void;
  onDeleteFile: (id: string) => void;
  onRenameFile: (id: string, name: string) => void;
}

/** Toolbar props */
export interface ToolbarProps {
  onNewSheet: () => void;
  onImport: () => void;
  onExport: (format: 'xlsx' | 'csv' | 'json') => void;
  onUndo: () => void;
  onRedo: () => void;
  onFormatPainter: () => void;
  onFindReplace: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleGridlines: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Status bar props */
export interface StatusBarProps {
  row: number;
  col: number;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onCellClick: (cellRef: string) => void;
}
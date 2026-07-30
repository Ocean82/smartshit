/**
 * UI Types
 *
 * Types related to component state, dialogs, and visual configuration.
 */

import type { CellRef } from './domain';
import React from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  /** Optional action for the toast */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Auto-dismiss duration in ms (default: 5000) */
  duration?: number;
  /** Undo action */
  undoAction?: () => void;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary' | 'secondary';
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  cell: string;
}

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  category: string;
  preview?: string;
  tags: string[];
  tool: string;
  prompt: string;
}

/** Panel identifiers for the dock panel system */
export type PanelId = 'chat' | 'insights' | 'auditor' | 'inspector';

export interface PanelDef {
  id: PanelId;
  icon: React.ReactNode;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  defaultSheetName: string;
  autoSave: boolean;
  showGridlines: boolean;
  showFormulaBar: boolean;
  showSheetTabs: boolean;
  fontSize: number;
  fontFamily: string;
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'conflict';
  lastSync?: number;
  pendingChanges?: number;
  error?: string;
}
/**
 * API Types
 *
 * Types for external APIs, chat messages, agent actions, and server communication.
 */

import type { CellRef, CellFormat, Selection } from './domain';

/** Which LLM provider/model produced an assistant reply (when known). */
export interface ProviderMeta {
  provider: string;
  model: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  actions?: AgentAction[];
  status?: 'pending' | 'applied' | 'rejected' | 'preview';
  toolUsed?: string;
  insightsSnapshot?: Record<string, unknown>;
  reasoning?: string;
  suggestions?: string[];
  /** Whether this message is pinned/bookmarked by the user */
  pinned?: boolean;
  /** Server-reported provider identity (dev / expandable details). */
  providerMeta?: ProviderMeta;
}

export interface AgentAction {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  description: string;
  status: ActionStatus;
  preview?: {
    changes: CellChange[];
    /** Risks the user should see before clicking Apply (Apply confirms them). */
    warnings?: string[];
  };
  /**
   * Locally trusted identity of the workbook/sheet/selection/revision this
   * proposal was prepared against. Never accepted from model output — a stale
   * action is rejected rather than applied somewhere else.
   */
  scope?: ActionScope;
  /**
   * Locally prepared, review-bound patch. Apply commits exactly this, so the
   * applied changes always match the reviewed preview. Generated in trusted
   * code only (never from model output).
   */
  prepared?: PreparedActionData;
}

/**
 * Lifecycle of a pending action.
 *
 * `previewing` / `applying` make an in-flight action visibly (and
 * synchronously) un-actionable, so a double click cannot execute twice.
 * `stale` means the reviewed scope no longer matches; `failed` means the commit
 * was attempted and rolled back.
 */
export type ActionStatus =
  | 'pending'
  | 'previewing'
  | 'applying'
  | 'applied'
  | 'rejected'
  | 'preview'
  | 'stale'
  | 'failed';

/** Workbook/sheet/selection/revision a proposal is bound to. */
export interface ActionScope {
  workbookId: string;
  sheetId: string;
  revision: number;
  selection: Selection | null;
  /** Page-load epoch — invalidates actions restored from persisted history. */
  epoch: string;
  /** Cheap content fingerprint of the target sheet. */
  sheetSignature: string;
}

/** Cell-value / format / row operations produced by a local dry-run. */
export interface PreparedScriptPatch {
  cellUpdates: Record<string, { value: string | number | boolean | null; formula?: string }>;
  formatUpdates: Record<string, Partial<CellFormat>>;
  rowDeletions: number[];
  rowInsertions: number[];
}

/** Trusted, locally prepared payload for an action. */
export interface PreparedActionData {
  kind: 'script';
  patch: PreparedScriptPatch;
  /** Fingerprint of the reviewed patch — Apply must commit exactly this. */
  signature: string;
}

export interface CellChange {
  cell: string;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
  oldFormula?: string;
  newFormula?: string;
  /** Optional human-readable note for changes that don't map to old/new cell
   * values (e.g. a format applied to a cell, or a row insert/delete). */
  description?: string;
}

export interface ServerHealth {
  ok: boolean;
  groq?: { model: string; available: boolean };
  openrouter?: { model: string; available: boolean };
  huggingface?: { model: string; available: boolean };
  ollama?: { model: string; available: boolean; modelRegistered: boolean };
  timestamp: number;
}

export interface UserApiKeyPayload {
  groq?: string;
  openrouter?: string;
  huggingface?: string;
  openai?: string;
}

export interface AttachedFilePreview {
  fileName: string;
  fileSize: number;
  workbook: {
    id: string;
    name: string;
    sheets: Array<{
      id: string;
      name: string;
      cells: Record<string, { value: string | number | boolean | null; formula?: string }>;
    }>;
    activeSheetId: string;
  };
  importWarnings?: string[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string;
  prompt: string;
  tools: string[];
  icon: string;
}

export interface ServerHealth {
  ok: boolean;
  groq?: { model: string; available: boolean };
  openrouter?: { model: string; available: boolean };
  huggingface?: { model: string; available: boolean };
  ollama?: { model: string; available: boolean; modelRegistered: boolean };
  timestamp: number;
}

export interface UserApiKeyPayload {
  groq?: string;
  openrouter?: string;
  huggingface?: string;
  openai?: string;
}

export interface AttachedFilePreview {
  fileName: string;
  fileSize: number;
  workbook: {
    id: string;
    name: string;
    sheets: Array<{
      id: string;
      name: string;
      cells: Record<string, { value: string | number | boolean | null; formula?: string }>;
    }>;
    activeSheetId: string;
  };
  importWarnings?: string[];
}

export interface AIRequest {
  function: string;
  args: Record<string, unknown>;
  byok?: UserApiKeyPayload;
}

export interface AIResponse {
  result: string | number | null;
  error?: string;
}

export interface AIError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AuditResult {
  score: number;
  totalCells: number;
  findings: AuditFinding[];
  summary: string;
}

export interface AuditFinding {
  id: string;
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  cellRef?: string;
  cellValue?: string | number | boolean | null;
  fixAction?: {
    cellId: string;
    formula?: string;
    value?: string | number | boolean | null;
  };
}

export interface SheetInsights {
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  categoryTotals: { label: string; amount: number }[];
  topExpenses: { label: string; amount: number }[];
  negativeVariances: { label: string; difference: number }[];
  outliers: { cellRef: string; column: string; value: number; row: number; zScore: number }[];
  columnStats: { column: string; mean: number; stdDev: number; min: number; max: number }[];
}

export interface SheetProfile {
  detectedPurpose: string;
  rowCount: number;
  colCount: number;
  cellCount: number;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface FormulaExplanation {
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AIMode {
  type: 'llm' | 'act' | 'advise' | 'explain' | 'help';
  parameters?: Record<string, unknown>;
}

export interface UserUsage {
  canAsk: boolean;
  remaining: number;
  dailyLimit: number;
  isPro: boolean;
  resetAt: number;
}

export interface AuthState {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  isPro: boolean;
  createdAt: number;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    dailyQueries: number;
    fileSize: number;
    sheets: number;
  };
}

export interface ExportOptions {
  format: 'xlsx' | 'csv' | 'json';
  sheets?: string[];
  includeCharts?: boolean;
  includeFormulas?: boolean;
}

export interface ImportResult {
  workbook: {
    id: string;
    name: string;
    sheets: Array<{
      name: string;
      rows: number;
    }>;
    activeSheetId: string;
  };
  warnings?: string[];
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  prompt: string;
  tool: string;
  tags: string[];
}

export interface CommunityTemplate extends TemplateDefinition {
  author: string;
  downloads: number;
  rating: number;
}

export interface TemplateSpec {
  tool: string;
  label: string;
  cells: Record<string, { value: string | number | boolean | null; formula?: string }>;
  formats: Array<{ ids: string[]; format: Partial<CellFormat> }>;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    dailyQueries: number;
    maxFileSize: number;
    maxSheets: number;
    historyDays: number;
  };
  isPopular?: boolean;
}

export interface WebSocketMessage {
  type: 'health' | 'ai-request' | 'ai-response' | 'sync' | 'notification';
  payload: unknown;
  timestamp: number;
}

export interface SyncMessage {
  type: 'cell-update' | 'sheet-update' | 'workbook-update' | 'user-presence';
  data: unknown;
  userId: string;
  timestamp: number;
}

export interface UserPresence {
  userId: string;
  userName: string;
  cursor?: CellRef;
  selection?: { startRow: number; startCol: number; endRow: number; endCol: number };
  color: string;
  lastActive: number;
}
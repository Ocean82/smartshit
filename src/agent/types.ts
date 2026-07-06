/**
 * AI Agent Integration Layer
 * 
 * This module defines the pluggable AI interface.
 * Replace the provider implementation to connect to any LLM.
 * 
 * Supported providers:
 * - OpenAI (GPT-4, etc.)
 * - Anthropic (Claude)
 * - Local models (Ollama, etc.)
 * - Custom APIs
 */

export interface AIAgentProvider {
  /** Unique identifier for this provider */
  id: string;
  /** Display name */
  name: string;
  /** Send a message and get a response */
  chat(params: ChatParams): Promise<ChatResponse>;
  /** Stream a response */
  chatStream?(params: ChatParams): AsyncGenerator<string>;
  /** Check if provider is configured */
  isConfigured(): boolean;
}

export interface ChatParams {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  tools?: ToolDefinition[];
  context?: SpreadsheetContext;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
  }>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface SpreadsheetContext {
  activeSheet: string;
  selectedCells: string[];
  sheetData: Record<string, {
    value: string | number | boolean | null;
    formula?: string;
  }>;
  sheetNames: string[];
}

// Tool definitions for the AI agent
export const SPREADSHEET_TOOLS: ToolDefinition[] = [
  {
    name: 'create_sheet',
    description: 'Create a new sheet in the workbook',
    parameters: {
      name: { type: 'string', description: 'Name of the new sheet', required: true },
    },
  },
  {
    name: 'write_cell',
    description: 'Write a value to a specific cell',
    parameters: {
      cell: { type: 'string', description: 'Cell reference (e.g., "A1")', required: true },
      value: { type: 'string', description: 'Value to write', required: true },
    },
  },
  {
    name: 'apply_formula',
    description: 'Apply a formula to a cell or range',
    parameters: {
      cell: { type: 'string', description: 'Cell reference', required: true },
      formula: { type: 'string', description: 'Excel formula (e.g., "=SUM(A1:A10)")', required: true },
    },
  },
  {
    name: 'create_chart',
    description: 'Create a chart from data',
    parameters: {
      type: { type: 'string', description: 'Chart type', enum: ['bar', 'line', 'pie', 'column', 'area'], required: true },
      dataRange: { type: 'string', description: 'Data range (e.g., "A1:B10")', required: true },
      title: { type: 'string', description: 'Chart title' },
    },
  },
  {
    name: 'format_cells',
    description: 'Format cells in a range',
    parameters: {
      range: { type: 'string', description: 'Cell range', required: true },
      bold: { type: 'boolean', description: 'Make text bold' },
      italic: { type: 'boolean', description: 'Make text italic' },
      bgColor: { type: 'string', description: 'Background color (hex)' },
      fontColor: { type: 'string', description: 'Font color (hex)' },
    },
  },
  {
    name: 'analyze_data',
    description: 'Analyze data in a range and provide insights',
    parameters: {
      range: { type: 'string', description: 'Data range to analyze', required: true },
    },
  },
  {
    name: 'filter_data',
    description: 'Apply filters to data',
    parameters: {
      range: { type: 'string', description: 'Range to filter', required: true },
      condition: { type: 'string', description: 'Filter condition' },
    },
  },
  {
    name: 'import_file',
    description: 'Import data from a file',
    parameters: {
      type: { type: 'string', description: 'File type', enum: ['csv', 'xlsx'] },
    },
  },
  {
    name: 'export_file',
    description: 'Export spreadsheet to file',
    parameters: {
      type: { type: 'string', description: 'Export format', enum: ['csv', 'xlsx'] },
    },
  },
];

/**
 * PLACEHOLDER AI PROVIDER
 * 
 * Replace this with your actual AI provider implementation.
 * 
 * Example:
 * ```
 * const AI_AGENT_PROVIDER: AIAgentProvider = new OpenAIProvider({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4',
 * });
 * ```
 */
export const AI_AGENT_PROVIDER = '<INSERT_AI_AGENT_HERE>';

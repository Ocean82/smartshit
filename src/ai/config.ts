export const AI_ANALYSIS_CONFIG = {
  maxRowsPreview: 120,
  maxRowsAnalysis: 10_000,
  maxImportRows: 5_000,
  maxImportCols: 200,
  maxFileSizeMb: 50,
  outlierStdThreshold: 2.5,
  trendMinPoints: 3,
  correlationThreshold: 0.7,
  currencySymbol: '$',
  decimalPlaces: 2,
  /** Max conversation history messages sent to cloud LLM providers */
  maxHistoryCloud: 12,
  /** Max conversation history messages sent to local Ollama */
  maxHistoryLocal: 4,
  /** Token threshold for triggering conversation summarization */
  summarizationThreshold: 8,
} as const

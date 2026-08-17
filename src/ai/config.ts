import { MAX_HISTORY_CLOUD, MAX_HISTORY_LOCAL, OUTLIER_STD_THRESHOLD } from '../../shared/config'

export const AI_ANALYSIS_CONFIG = {
  maxRowsPreview: 120,
  maxRowsAnalysis: 10_000,
  maxImportRows: 5_000,
  maxImportCols: 200,
  maxFileSizeMb: 50,
  outlierStdThreshold: OUTLIER_STD_THRESHOLD,
  trendMinPoints: 3,
  correlationThreshold: 0.7,
  currencySymbol: '$',
  decimalPlaces: 2,
  /** Max conversation history messages sent to cloud LLM providers */
  maxHistoryCloud: MAX_HISTORY_CLOUD,
  /** Max conversation history messages sent to local Ollama */
  maxHistoryLocal: MAX_HISTORY_LOCAL,
  /** Token threshold for triggering conversation summarization */
  summarizationThreshold: 8,
} as const

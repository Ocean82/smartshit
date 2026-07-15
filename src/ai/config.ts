export const AI_ANALYSIS_CONFIG = {
  maxRowsPreview: 60,
  maxRowsAnalysis: 10_000,
  maxImportRows: 5_000,
  maxImportCols: 200,
  maxFileSizeMb: 50,
  outlierStdThreshold: 2.5,
  trendMinPoints: 3,
  correlationThreshold: 0.7,
  currencySymbol: '$',
  decimalPlaces: 2,
} as const

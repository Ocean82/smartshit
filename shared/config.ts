/**
 * Shared Configuration Constants — Single source of truth.
 *
 * Values that MUST stay aligned between client and server belong here.
 * Both `src/` (frontend) and `server/src/` import from this module.
 *
 * Env vars on the server can override these defaults at runtime, but the
 * defaults here are canonical and must match the .env.example/.env.production.
 */

// ─── Free-Tier Limits ────────────────────────────────────────────────────────

/** AI chat questions per day for free users */
export const FREE_DAILY_LIMIT = 7

/** Maximum cloud workbooks for free users (Pro unlimited) */
export const FREE_CLOUD_WORKBOOK_LIMIT = 1

// ─── AI / LLM Configuration ─────────────────────────────────────────────────

/** Max conversation history messages sent to cloud LLM providers */
export const MAX_HISTORY_CLOUD = 12

/** Max conversation history messages sent to local Ollama */
export const MAX_HISTORY_LOCAL = 4

/** Standard deviation threshold for outlier detection */
export const OUTLIER_STD_THRESHOLD = 2.5

// ─── Version History ─────────────────────────────────────────────────────────

/** Max workbook versions retained before pruning (per workbook) */
export const MAX_WORKBOOK_VERSIONS = 50

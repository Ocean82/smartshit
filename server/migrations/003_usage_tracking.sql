-- Migration: 003_usage_tracking
-- Description: Durable per-user daily AI usage counters
-- Purpose: The free-tier quota previously lived in an in-process Map, so it
--          reset on every deploy/restart and was multiplied by the number of
--          server processes. Persisting it makes the limit real.

-- ─── Daily AI usage ──────────────────────────────────────────────────────────
-- One row per user per UTC day. Rows are upserted on each billable AI call.

CREATE TABLE IF NOT EXISTS smartsht.ai_usage_daily (
  user_id TEXT NOT NULL,
  usage_date DATE NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date)
);

-- Supports the nightly/periodic prune of historical rows
CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON smartsht.ai_usage_daily(usage_date);

-- Migration: 006_autofix_usage
-- Lifetime auditor auto-fix count per free user. Previously only in browser
-- localStorage, so clearing site data (or saving any BYOK key) reset the limit.

CREATE TABLE IF NOT EXISTS smartsht.autofix_usage (
  user_id TEXT PRIMARY KEY,
  used_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

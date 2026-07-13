-- Migration: 001_cloud_foundation
-- Description: Create smartsht schema with tables for cloud persistence
-- Date: 2026-07-11
-- Run against: burntbeats database on RDS

-- ─── Schema ──────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS smartsht;

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE smartsht.users (
  id TEXT PRIMARY KEY,                    -- Clerk user ID
  email TEXT,
  display_name TEXT,
  plan TEXT DEFAULT 'free',               -- 'free' | 'pro'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Workbooks ───────────────────────────────────────────────────────────────

CREATE TABLE smartsht.workbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES smartsht.users(id),
  name TEXT NOT NULL,
  s3_key TEXT NOT NULL,                    -- S3 object key for latest version
  size_bytes INTEGER DEFAULT 0,
  sheet_count INTEGER DEFAULT 1,
  last_saved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE         -- Soft delete
);

CREATE INDEX idx_workbooks_owner ON smartsht.workbooks(owner_id) WHERE NOT is_deleted;

-- ─── Version History ─────────────────────────────────────────────────────────

CREATE TABLE smartsht.workbook_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  s3_key TEXT NOT NULL,                    -- S3 key for this version's snapshot
  size_bytes INTEGER DEFAULT 0,
  description TEXT,                        -- "Auto-save" or "Before import" etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_versions_workbook ON smartsht.workbook_versions(workbook_id, version_number DESC);

-- ─── Shared Workbooks ────────────────────────────────────────────────────────

CREATE TABLE smartsht.shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES smartsht.users(id),
  share_token TEXT UNIQUE NOT NULL,        -- Random token for the share URL
  permission TEXT DEFAULT 'view',          -- 'view' | 'edit'
  expires_at TIMESTAMPTZ,                  -- NULL = never expires
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shares_token ON smartsht.shares(share_token);

-- ─── Community Templates ─────────────────────────────────────────────────────

CREATE TABLE smartsht.community_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id TEXT NOT NULL REFERENCES smartsht.users(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  icon TEXT DEFAULT '📄',
  prompt TEXT NOT NULL,
  s3_key TEXT,                             -- Optional: full template package in S3
  downloads INTEGER DEFAULT 0,
  rating_sum INTEGER DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON smartsht.community_templates(category) WHERE is_published;
CREATE INDEX idx_templates_popular ON smartsht.community_templates(downloads DESC) WHERE is_published;

-- Migration: 008_share_shared_by_name
-- Per-share "Shared by" label chosen at creation time (typed name, Clerk name,
-- optionally with email). NULL falls back to users.display_name, then 'Someone'.
ALTER TABLE smartsht.shares ADD COLUMN IF NOT EXISTS shared_by_name TEXT;

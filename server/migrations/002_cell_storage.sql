-- Migration: 002_cell_storage
-- Description: EAV (sparse matrix) cell storage for AI agent SQL access
-- Date: 2026-07-15
-- Purpose: Enables the AI agent to query user spreadsheet data directly via SQL
--          instead of relying on truncated text previews sent in the LLM prompt.

-- ─── Spreadsheet Cells (Sparse Matrix / EAV) ────────────────────────────────
-- Each row represents ONE populated cell. Empty cells are not stored.
-- This is the core table the AI agent queries for data operations.

CREATE TABLE smartsht.cells (
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  sheet_index SMALLINT NOT NULL DEFAULT 0,   -- Which sheet tab (0-based)
  row_index INT NOT NULL,
  col_index INT NOT NULL,
  raw_value TEXT,                             -- What the user typed ("100", "=SUM(A1:A5)", "Hello")
  computed_value TEXT,                        -- The evaluated result ("500", "Hello")
  data_type VARCHAR(20) DEFAULT 'string',    -- 'number', 'string', 'boolean', 'formula', 'date', 'empty'
  format JSONB,                              -- Cell formatting (bold, color, borders, etc.)
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workbook_id, sheet_index, row_index, col_index)
);

-- Fast lookups: "give me all cells in this sheet"
CREATE INDEX idx_cells_sheet ON smartsht.cells(workbook_id, sheet_index);

-- Fast lookups: "find cells in this column" (for aggregation queries)
CREATE INDEX idx_cells_column ON smartsht.cells(workbook_id, sheet_index, col_index)
  WHERE data_type = 'number';

-- Fast lookups: "find cells with a specific value" (for conditional formatting)
CREATE INDEX idx_cells_value ON smartsht.cells(workbook_id, sheet_index, computed_value)
  WHERE computed_value IS NOT NULL;

-- ─── Sheet Metadata ──────────────────────────────────────────────────────────
-- Lightweight metadata about each sheet tab (name, column headers, row count)
-- Used by the AI agent to understand sheet structure without scanning all cells.

CREATE TABLE smartsht.sheet_meta (
  workbook_id UUID NOT NULL REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  sheet_index SMALLINT NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT 'Sheet1',
  row_count INT DEFAULT 0,
  col_count INT DEFAULT 0,
  headers JSONB,                             -- Array of column header labels ["Name", "Amount", "Date"]
  column_types JSONB,                        -- Detected types per column ["string", "number", "date"]
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workbook_id, sheet_index)
);

-- ─── Sync Status ─────────────────────────────────────────────────────────────
-- Tracks whether a workbook's cells table is up-to-date with S3.
-- Prevents redundant re-syncs on every load.

CREATE TABLE smartsht.cell_sync (
  workbook_id UUID PRIMARY KEY REFERENCES smartsht.workbooks(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMPTZ,
  cell_count INT DEFAULT 0,
  version_hash TEXT                           -- Quick check: has the workbook changed since last sync?
);

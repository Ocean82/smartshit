-- Migration: 005_soft_delete_purge
-- Track when soft-delete happened so a grace-period job can hard-purge
-- S3 objects + DB rows (shares cascade on workbook DELETE).

ALTER TABLE smartsht.workbooks
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill existing soft-deletes so they enter the purge window.
UPDATE smartsht.workbooks
SET deleted_at = COALESCE(last_saved_at, NOW())
WHERE is_deleted AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workbooks_purge
  ON smartsht.workbooks (deleted_at)
  WHERE is_deleted;

-- Migration: 004_version_number_unique
-- Prevent concurrent saves from allocating the same version_number.
-- Pair with SELECT … FOR UPDATE on the workbook row when allocating.

-- Drop accidental duplicates (keep the newest row by created_at / ctid).
DELETE FROM smartsht.workbook_versions a
USING smartsht.workbook_versions b
WHERE a.workbook_id = b.workbook_id
  AND a.version_number = b.version_number
  AND a.ctid < b.ctid;

ALTER TABLE smartsht.workbook_versions
  ADD CONSTRAINT workbook_versions_workbook_version_unique
  UNIQUE (workbook_id, version_number);

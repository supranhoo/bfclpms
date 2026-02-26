
-- Remove duplicates keeping latest
DELETE FROM audit_kpi_level_assignments a
USING audit_kpi_level_assignments b
WHERE a.kpi_id = b.kpi_id
  AND a.created_at < b.created_at;

-- Drop old constraint, add new one
ALTER TABLE audit_kpi_level_assignments
  DROP CONSTRAINT IF EXISTS audit_kpi_level_assignments_kpi_id_auditor_id_key;

ALTER TABLE audit_kpi_level_assignments
  ADD CONSTRAINT audit_kpi_level_assignments_kpi_id_key UNIQUE (kpi_id);

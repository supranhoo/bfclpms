-- CAPA-2026-07 — Self achieved-value snapshot integrity (§88.6 / ADR-106)

-- Bypass user triggers (period-lock guard) for this one-shot admin backfill.
SET session_replication_role = 'replica';

WITH last_event AS (
  SELECT DISTINCT ON (l.kpi_id)
    l.kpi_id,
    l.action,
    l.on_behalf_role
  FROM public.kpi_audit_logs l
  ORDER BY l.kpi_id, l.created_at DESC
),
targets AS (
  SELECT rs.kpi_id, rs.self_achieved_value AS old_snap, rs.achieved_value AS new_snap
  FROM public.review_submissions rs
  JOIN last_event le ON le.kpi_id = rs.kpi_id
  WHERE rs.achieved_value IS NOT NULL
    AND rs.self_achieved_value IS DISTINCT FROM rs.achieved_value
    AND (
      le.action = 'ADMIN_DATA_ENTRY_SELF'
      OR le.action = 'SELF_REVIEW_SUBMITTED'
      OR le.action = 'BACKFILL_SELF_REVIEW_SUBMITTED'
      OR le.action = 'OKV_AUTO_ADVANCED_RESYNC'
      OR (le.action = 'ADMIN_OVERRIDE' AND COALESCE(le.on_behalf_role, '') = 'self')
    )
),
audit_ins AS (
  INSERT INTO public.kpi_audit_logs (
    kpi_id, action, performed_by, old_value, new_value, metadata
  )
  SELECT
    t.kpi_id,
    'SELF_SNAPSHOT_RESYNC',
    NULL,
    jsonb_build_object('self_achieved_value', t.old_snap),
    jsonb_build_object('self_achieved_value', t.new_snap),
    jsonb_build_object(
      'policy', '§88.6 CAPA-2026-07',
      'source', 'capa_self_snapshot_backfill',
      'reason', 'Self-owning writer updated achieved_value without mirroring self_achieved_value'
    )
  FROM targets t
  RETURNING kpi_id
)
UPDATE public.review_submissions rs
SET self_achieved_value = rs.achieved_value,
    updated_at = now()
FROM targets t
WHERE rs.kpi_id = t.kpi_id;

SET session_replication_role = 'origin';

-- Preventive trigger: mirror self_achieved_value on self-owning UPDATEs.
CREATE OR REPLACE FUNCTION public.enforce_self_snapshot_mirror()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reviewer_stage_touched boolean;
BEGIN
  IF NEW.achieved_value IS NOT DISTINCT FROM OLD.achieved_value THEN
    RETURN NEW;
  END IF;

  IF NEW.self_achieved_value IS DISTINCT FROM OLD.self_achieved_value THEN
    RETURN NEW;
  END IF;

  reviewer_stage_touched :=
       (NEW.manager_achieved_value            IS DISTINCT FROM OLD.manager_achieved_value)
    OR (NEW.skip_level_achieved_value         IS DISTINCT FROM OLD.skip_level_achieved_value)
    OR (NEW.hr_pms_achieved_value             IS DISTINCT FROM OLD.hr_pms_achieved_value)
    OR (NEW.auditor_achieved_value            IS DISTINCT FROM OLD.auditor_achieved_value)
    OR (NEW.management_achieved_value         IS DISTINCT FROM OLD.management_achieved_value)
    OR (NEW.functional_manager_achieved_value IS DISTINCT FROM OLD.functional_manager_achieved_value);

  IF reviewer_stage_touched THEN
    RETURN NEW;
  END IF;

  NEW.self_achieved_value := NEW.achieved_value;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_self_snapshot_mirror ON public.review_submissions;
CREATE TRIGGER trg_enforce_self_snapshot_mirror
BEFORE UPDATE ON public.review_submissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_self_snapshot_mirror();

COMMENT ON FUNCTION public.enforce_self_snapshot_mirror() IS
'CAPA-2026-07 / §88.6 / ADR-106 — Self-owning writers that update achieved_value but omit self_achieved_value get the frozen snapshot auto-mirrored. Reviewer-stage writers (which touch <stage>_achieved_value in the same UPDATE) are exempt.';

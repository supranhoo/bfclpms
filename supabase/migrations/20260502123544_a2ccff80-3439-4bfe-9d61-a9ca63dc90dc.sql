-- BUG-047 v2: Make the on-behalf score-or-N/A guardrail WRITE-SCOPED.
-- Previously the trigger inspected NEW.auto_advance_reason on every UPDATE,
-- so any later edit of a row that still carried stale "...on behalf of hr_pms"
-- text (left over after step-back / status override / cascade-clear) was
-- incorrectly blocked even when the current write had nothing to do with
-- the on-behalf event.

CREATE OR REPLACE FUNCTION public.enforce_on_behalf_score_or_na()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reason_lc text := lower(coalesce(NEW.auto_advance_reason, ''));
  old_reason_lc text := lower(coalesce(OLD.auto_advance_reason, ''));
  is_on_behalf boolean := reason_lc LIKE '%on behalf of%';
  reason_changed boolean;
BEGIN
  -- Skip if not an on-behalf reason at all, or row is explicitly N/A
  IF NOT is_on_behalf OR NEW.is_na = true THEN
    RETURN NEW;
  END IF;

  -- Skip BUG-047 repair / fast-track writes — they have their own provenance
  IF reason_lc LIKE 'repaired%' OR reason_lc LIKE 'fast-tracked%' THEN
    RETURN NEW;
  END IF;

  -- WRITE-SCOPED CHECK: only enforce when THIS write is the on-behalf event.
  -- That means either an INSERT, or an UPDATE that is actually changing the
  -- reason text (i.e. the on-behalf submission is happening right now).
  -- Any later UPDATE that merely inherits the stale reason text is allowed
  -- through — the original BUG-047 protection already ran on the original
  -- write, so we don't need to re-validate downstream edits.
  reason_changed := (TG_OP = 'INSERT') OR (old_reason_lc IS DISTINCT FROM reason_lc);

  IF NOT reason_changed THEN
    RETURN NEW;
  END IF;

  -- Detect which stage is being written on-behalf (only on the actual write)
  IF reason_lc LIKE '%on behalf of manager%' THEN
    IF NEW.manager_score IS NULL AND NEW.manager_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf manager submission requires manager_score, manager_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of skip_level%' THEN
    IF NEW.skip_level_score IS NULL AND NEW.skip_level_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf skip_level submission requires skip_level_score, skip_level_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of hr_pms%' THEN
    IF NEW.hr_pms_score IS NULL AND NEW.hr_pms_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf hr_pms submission requires hr_pms_score, hr_pms_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of auditor%' THEN
    IF NEW.auditor_score IS NULL AND NEW.auditor_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf auditor submission requires auditor_score, auditor_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of management%' THEN
    IF NEW.management_score IS NULL AND NEW.management_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf management submission requires management_score, management_rating, or is_na = true';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- One-time data repair: clear stale on-behalf reason text on rows that have
-- already been cascade-cleared (score + rating both NULL, not N/A). These
-- rows are currently impossible to update due to the old trigger.
DO $$
DECLARE
  repaired_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT rs.id, rs.kpi_id, rs.auto_advance_reason
    FROM public.review_submissions rs
    WHERE rs.auto_advance_reason ILIKE '%on behalf of%'
      AND coalesce(rs.is_na, false) = false
      AND (
        (rs.auto_advance_reason ILIKE '%on behalf of manager%'    AND rs.manager_score    IS NULL AND rs.manager_rating    IS NULL) OR
        (rs.auto_advance_reason ILIKE '%on behalf of skip_level%' AND rs.skip_level_score IS NULL AND rs.skip_level_rating IS NULL) OR
        (rs.auto_advance_reason ILIKE '%on behalf of hr_pms%'     AND rs.hr_pms_score     IS NULL AND rs.hr_pms_rating     IS NULL) OR
        (rs.auto_advance_reason ILIKE '%on behalf of auditor%'    AND rs.auditor_score    IS NULL AND rs.auditor_rating    IS NULL) OR
        (rs.auto_advance_reason ILIKE '%on behalf of management%' AND rs.management_score IS NULL AND rs.management_rating IS NULL)
      )
  LOOP
    UPDATE public.review_submissions
    SET auto_advance_reason = NULL
    WHERE id = r.id;

    INSERT INTO public.kpi_audit_logs (
      kpi_id, submission_id, action, performed_by, on_behalf_of, on_behalf_role,
      old_value, new_value, metadata
    ) VALUES (
      r.kpi_id, r.id, 'RECONCILE_STATUS', NULL, NULL, NULL,
      jsonb_build_object('auto_advance_reason', r.auto_advance_reason),
      jsonb_build_object('auto_advance_reason', NULL),
      jsonb_build_object(
        'reason', 'bug047_stale_reason_repair_v1',
        'note', 'Cleared stale on-behalf provenance text after cascade-clear; original score/rating already null'
      )
    );

    repaired_count := repaired_count + 1;
  END LOOP;

  RAISE NOTICE 'BUG-047 stale-reason repair: cleared % row(s)', repaired_count;
END $$;
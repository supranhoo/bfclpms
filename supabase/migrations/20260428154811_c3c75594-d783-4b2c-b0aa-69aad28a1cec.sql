-- =====================================================================
-- BUG-047: HR PMS On-Behalf score-or-N/A guardrail + data repair
-- =====================================================================
-- Root cause: useAdminSubmitReviewData allowed an admin to advance a KPI
-- past a reviewer stage (hr_pms_review etc.) without writing the stage
-- score and without marking is_na = true. 3 KPIs for Lekh Raj (101959)
-- in March 2026 are stuck in this state, causing the HR PMS dashboard
-- counter to read 592 / 595.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Data repair — flag the 3 affected KPIs as N/A so the counter
--    reconciles. Idempotent: only updates rows still matching the
--    broken signature (status=approved, hr_pms_score IS NULL,
--    is_na = false, auto_advance_reason indicating admin on-behalf).
-- ---------------------------------------------------------------------
WITH lekh_raj_repair AS (
  UPDATE public.review_submissions rs
  SET
    is_na = true,
    na_marked_by_role = 'admin',
    auto_advance_reason = 'Repaired (BUG-047): admin advanced past HR PMS without scoring; flagged as N/A',
    updated_at = now()
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id
  WHERE rs.kpi_id = k.id
    AND p.employee_code = '101959'
    AND k.review_period = 'March'
    AND k.review_year = 2026
    AND k.status = 'approved'
    AND rs.hr_pms_score IS NULL
    AND (rs.is_na IS NULL OR rs.is_na = false)
    AND rs.auto_advance_reason ILIKE '%on behalf of hr_pms%'
  RETURNING rs.kpi_id, rs.id AS submission_id
)
INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, on_behalf_of, on_behalf_role, old_value, new_value, metadata)
SELECT
  lr.kpi_id,
  'BUG_047_DATA_REPAIR',
  NULL,                                 -- system-attributed (per memory rule)
  k.employee_id,
  'admin',
  NULL,
  jsonb_build_object('is_na', true, 'na_marked_by_role', 'admin'),
  jsonb_build_object(
    'bug', 'BUG-047',
    'reason', 'Admin advanced KPI past hr_pms_review without writing hr_pms_score or is_na flag. Backfilled as N/A so HR PMS Reviewed counter reconciles.',
    'employee_code', '101959',
    'review_period', 'March',
    'review_year', 2026
  )
FROM lekh_raj_repair lr
JOIN public.kpis k ON k.id = lr.kpi_id;

-- ---------------------------------------------------------------------
-- 2. Guardrail trigger — block on-behalf submissions that try to advance
--    a KPI past a reviewer stage with neither a stage score/rating nor
--    is_na = true.
--
--    Why a trigger? The write path is split between the application
--    (useAdminSubmitReviewData) and direct admin tooling. A DB trigger
--    is the single chokepoint that guarantees the rule across all paths.
--
--    Rule per stage (when auto_advance_reason indicates an on-behalf
--    write for that stage):
--      - manager     : require manager_score   OR manager_rating   OR is_na
--      - skip_level  : require skip_level_score OR skip_level_rating OR is_na
--      - hr_pms      : require hr_pms_score   OR hr_pms_rating    OR is_na
--      - auditor     : require auditor_score  OR auditor_rating   OR is_na
--      - management  : require management_score OR management_rating OR is_na
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_on_behalf_score_or_na()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reason_lc text := lower(coalesce(NEW.auto_advance_reason, ''));
  is_on_behalf boolean := reason_lc LIKE '%on behalf of%';
  stage text;
BEGIN
  -- Skip if not an on-behalf write, or if explicitly marked N/A
  IF NOT is_on_behalf OR NEW.is_na = true THEN
    RETURN NEW;
  END IF;

  -- Skip BUG-047 repair / fast-track writes — they have their own provenance
  IF reason_lc LIKE 'repaired%' OR reason_lc LIKE 'fast-tracked%' THEN
    RETURN NEW;
  END IF;

  -- Detect which stage is being written on-behalf
  IF reason_lc LIKE '%on behalf of manager%' THEN
    stage := 'manager';
    IF NEW.manager_score IS NULL AND NEW.manager_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf manager submission requires manager_score, manager_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of skip_level%' THEN
    stage := 'skip_level';
    IF NEW.skip_level_score IS NULL AND NEW.skip_level_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf skip_level submission requires skip_level_score, skip_level_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of hr_pms%' THEN
    stage := 'hr_pms';
    IF NEW.hr_pms_score IS NULL AND NEW.hr_pms_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf hr_pms submission requires hr_pms_score, hr_pms_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of auditor%' THEN
    stage := 'auditor';
    IF NEW.auditor_score IS NULL AND NEW.auditor_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf auditor submission requires auditor_score, auditor_rating, or is_na = true';
    END IF;
  ELSIF reason_lc LIKE '%on behalf of management%' THEN
    stage := 'management';
    IF NEW.management_score IS NULL AND NEW.management_rating IS NULL THEN
      RAISE EXCEPTION 'BUG-047 guardrail: on-behalf management submission requires management_score, management_rating, or is_na = true';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_on_behalf_score_or_na ON public.review_submissions;
CREATE TRIGGER trg_enforce_on_behalf_score_or_na
BEFORE INSERT OR UPDATE ON public.review_submissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_on_behalf_score_or_na();

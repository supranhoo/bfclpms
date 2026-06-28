
-- =========================================================================
-- ADR-090: Multi-month cycle anchor drift — repair + prevention
-- =========================================================================

-- 1) Intra-year drift detector (lightweight summary used by daily monitor)
CREATE OR REPLACE FUNCTION public.detect_intra_year_cycle_anchor_drift()
RETURNS TABLE (
  employee_id uuid,
  kpi_name text,
  review_year integer,
  frequency text,
  anchors text[],
  affected_row_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    k.employee_id,
    k.kpi_name,
    k.review_year,
    k.frequency,
    array_agg(DISTINCT k.frequency_cycle_start ORDER BY k.frequency_cycle_start) AS anchors,
    count(*) AS affected_row_count
  FROM public.kpis k
  WHERE k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
    AND k.frequency_cycle_start IS NOT NULL
  GROUP BY k.employee_id, k.kpi_name, k.review_year, k.frequency
  HAVING count(DISTINCT k.frequency_cycle_start) > 1;
$$;

REVOKE ALL ON FUNCTION public.detect_intra_year_cycle_anchor_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_intra_year_cycle_anchor_drift() TO authenticated, service_role;

-- 2) Repair tool: oldest-row-wins strategy.
--    The first row created for a given (employee_id, kpi_name, review_year)
--    tuple carries the authoritative anchor (it pre-dates any buggy cron
--    rollover). All later siblings with a different anchor are corrected to
--    match, provided the authoritative anchor is valid for the frequency.
--    Every UPDATE is audit-trailed in kpi_audit_logs with policy='ADR-090'.
CREATE OR REPLACE FUNCTION public.repair_intra_year_cycle_anchor_drift(
  p_dry_run boolean DEFAULT true,
  p_safety_ceiling integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planned_count int;
  v_repaired_count int := 0;
  v_skipped_invalid int := 0;
  v_caller uuid := auth.uid();
  rec record;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Build authoritative map + candidate rows
  CREATE TEMP TABLE tmp_anchor_repair_plan ON COMMIT DROP AS
  WITH oldest AS (
    SELECT DISTINCT ON (employee_id, kpi_name, review_year)
      employee_id, kpi_name, review_year, frequency,
      frequency_cycle_start AS authoritative_anchor
    FROM public.kpis
    WHERE frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
      AND frequency_cycle_start IS NOT NULL
    ORDER BY employee_id, kpi_name, review_year, created_at ASC, id ASC
  ),
  drifted AS (
    SELECT employee_id, kpi_name, review_year, frequency
    FROM public.kpis
    WHERE frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
      AND frequency_cycle_start IS NOT NULL
    GROUP BY 1,2,3,4
    HAVING count(DISTINCT frequency_cycle_start) > 1
  )
  SELECT
    k.id AS kpi_id,
    k.frequency,
    k.review_period,
    k.review_year,
    k.frequency_cycle_start AS current_anchor,
    o.authoritative_anchor,
    public.is_valid_cycle_anchor(k.frequency, o.authoritative_anchor) AS authoritative_is_valid
  FROM public.kpis k
  JOIN drifted d USING (employee_id, kpi_name, review_year, frequency)
  JOIN oldest o
    ON o.employee_id = k.employee_id
   AND o.kpi_name = k.kpi_name
   AND o.review_year = k.review_year
  WHERE k.frequency_cycle_start IS DISTINCT FROM o.authoritative_anchor;

  SELECT count(*) INTO v_planned_count FROM tmp_anchor_repair_plan;

  IF v_planned_count > p_safety_ceiling THEN
    RAISE EXCEPTION 'Anchor repair aborted: % rows exceed safety ceiling of %', v_planned_count, p_safety_ceiling;
  END IF;

  SELECT count(*) INTO v_skipped_invalid
  FROM tmp_anchor_repair_plan WHERE NOT authoritative_is_valid;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'planned_updates', v_planned_count,
      'skipped_invalid_authoritative', v_skipped_invalid,
      'will_repair', v_planned_count - v_skipped_invalid
    );
  END IF;

  FOR rec IN SELECT * FROM tmp_anchor_repair_plan WHERE authoritative_is_valid LOOP
    UPDATE public.kpis
       SET frequency_cycle_start = rec.authoritative_anchor
     WHERE id = rec.kpi_id;

    INSERT INTO public.kpi_audit_logs (
      kpi_id, action, old_value, new_value, performed_by, metadata
    ) VALUES (
      rec.kpi_id,
      'KPI_CYCLE_ANCHOR_REPAIRED',
      jsonb_build_object('frequency_cycle_start', rec.current_anchor),
      jsonb_build_object('frequency_cycle_start', rec.authoritative_anchor),
      NULL,
      jsonb_build_object(
        'frequency', rec.frequency,
        'review_period', rec.review_period,
        'review_year', rec.review_year,
        'system_action', true,
        'strategy', 'oldest_row_wins',
        'policy', 'ADR-090'
      )
    );
    v_repaired_count := v_repaired_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', false,
    'planned_updates', v_planned_count,
    'skipped_invalid_authoritative', v_skipped_invalid,
    'repaired', v_repaired_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_intra_year_cycle_anchor_drift(boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_intra_year_cycle_anchor_drift(boolean, integer) TO authenticated, service_role;

-- 3) Prevention trigger: block INSERTs that would create intra-year anchor divergence.
--    Fires only on INSERT (UPDATE intentionally exempt so the repair tool above and
--    legitimate admin edits via existing propagation paths continue to work).
--    Allows the insert when:
--      - no other row exists for (employee_id, kpi_name, review_year, frequency), OR
--      - every existing row in that tuple already has the same frequency_cycle_start as NEW.
CREATE OR REPLACE FUNCTION public.enforce_intra_year_cycle_anchor_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_anchor text;
  v_conflict_count int;
BEGIN
  IF NEW.frequency_cycle_start IS NULL
     OR NEW.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_conflict_count
  FROM public.kpis
  WHERE employee_id = NEW.employee_id
    AND kpi_name    = NEW.kpi_name
    AND review_year = NEW.review_year
    AND frequency   = NEW.frequency
    AND frequency_cycle_start IS NOT NULL
    AND frequency_cycle_start <> NEW.frequency_cycle_start;

  IF v_conflict_count > 0 THEN
    SELECT frequency_cycle_start INTO v_existing_anchor
    FROM public.kpis
    WHERE employee_id = NEW.employee_id
      AND kpi_name    = NEW.kpi_name
      AND review_year = NEW.review_year
      AND frequency   = NEW.frequency
      AND frequency_cycle_start IS NOT NULL
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    RAISE EXCEPTION
      'Cycle anchor conflict (ADR-090): cannot insert KPI with anchor %, existing rows in same year use %.  Use the same anchor across all sibling months.',
      NEW.frequency_cycle_start, v_existing_anchor
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_intra_year_cycle_anchor_consistency ON public.kpis;
CREATE TRIGGER trg_enforce_intra_year_cycle_anchor_consistency
  BEFORE INSERT ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_intra_year_cycle_anchor_consistency();

COMMENT ON FUNCTION public.repair_intra_year_cycle_anchor_drift(boolean, integer) IS
  'ADR-090. Oldest-row-wins repair for multi-month cycle anchor drift introduced by pre-ADR-088 rollover bug. Admin only. Audit-trailed in kpi_audit_logs.';
COMMENT ON FUNCTION public.detect_intra_year_cycle_anchor_drift() IS
  'ADR-090. Returns tuples whose multi-month cycle anchors disagree within the same fiscal year. Used by the daily drift monitor.';
COMMENT ON TRIGGER trg_enforce_intra_year_cycle_anchor_consistency ON public.kpis IS
  'ADR-090. Blocks new KPI inserts whose frequency_cycle_start conflicts with existing siblings in the same fiscal year.';

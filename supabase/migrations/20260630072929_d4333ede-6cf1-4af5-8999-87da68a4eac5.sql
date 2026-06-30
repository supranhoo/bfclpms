
DROP FUNCTION IF EXISTS public.detect_intra_year_cycle_anchor_drift();

CREATE OR REPLACE FUNCTION public.expand_cycle_window_months(
  p_frequency text,
  p_anchor    text
) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  abbrev text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  full_names text[] := ARRAY['January','February','March','April','May','June',
                             'July','August','September','October','November','December'];
  cycle_len int;
  start_idx int;
  i int;
  out_months text[] := ARRAY[]::text[];
BEGIN
  IF p_anchor IS NULL OR p_frequency IS NULL THEN RETURN out_months; END IF;
  cycle_len := CASE trim(p_frequency)
    WHEN 'Bi-Monthly'  THEN 2
    WHEN 'Quarterly'   THEN 3
    WHEN 'Half-Yearly' THEN 6
    WHEN 'Yearly'      THEN 12
    ELSE 1
  END;
  IF cycle_len <= 1 THEN RETURN out_months; END IF;
  start_idx := array_position(abbrev, split_part(p_anchor, '-', 1));
  IF start_idx IS NULL THEN RETURN out_months; END IF;
  FOR i IN 0 .. (cycle_len - 1) LOOP
    out_months := out_months || full_names[((start_idx - 1 + i) % 12) + 1];
  END LOOP;
  RETURN out_months;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_intra_year_cycle_anchor_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_window_months text[];
  v_conflict_anchor text;
BEGIN
  IF NEW.frequency_cycle_start IS NULL
     OR NEW.frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NEW;
  END IF;
  v_window_months := public.expand_cycle_window_months(NEW.frequency, NEW.frequency_cycle_start);
  IF array_length(v_window_months, 1) IS NULL THEN RETURN NEW; END IF;

  SELECT frequency_cycle_start INTO v_conflict_anchor
  FROM public.kpis
  WHERE employee_id = NEW.employee_id
    AND kpi_name    = NEW.kpi_name
    AND review_year = NEW.review_year
    AND frequency   = NEW.frequency
    AND frequency_cycle_start IS NOT NULL
    AND frequency_cycle_start <> NEW.frequency_cycle_start
    AND review_period = ANY (v_window_months)
  LIMIT 1;

  IF v_conflict_anchor IS NOT NULL THEN
    RAISE EXCEPTION
      'Cycle anchor conflict (ADR-091): cycle window % already uses anchor %, cannot insert with anchor %',
      NEW.frequency_cycle_start, v_conflict_anchor, NEW.frequency_cycle_start
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.detect_intra_year_cycle_anchor_drift()
RETURNS TABLE (
  employee_id uuid,
  kpi_name text,
  review_year integer,
  frequency text,
  cycle_window text,
  anchors text[],
  affected_row_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH classified AS (
    SELECT
      k.employee_id, k.kpi_name, k.review_year, k.frequency, k.frequency_cycle_start,
      public.resolve_cycle_anchor(
        k.frequency,
        array_position(
          ARRAY['January','February','March','April','May','June',
                'July','August','September','October','November','December'],
          k.review_period
        ) - 1
      ) AS canonical_window
    FROM public.kpis k
    WHERE k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
      AND k.frequency_cycle_start IS NOT NULL
  )
  SELECT employee_id, kpi_name, review_year, frequency,
         canonical_window AS cycle_window,
         array_agg(DISTINCT frequency_cycle_start ORDER BY frequency_cycle_start) AS anchors,
         count(*) AS affected_row_count
  FROM classified
  WHERE canonical_window IS NOT NULL
  GROUP BY employee_id, kpi_name, review_year, frequency, canonical_window
  HAVING count(DISTINCT frequency_cycle_start) > 1;
$$;

CREATE OR REPLACE FUNCTION public.repair_intra_year_cycle_anchor_drift(
  p_dry_run boolean DEFAULT true,
  p_safety_ceiling integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  CREATE TEMP TABLE tmp_anchor_repair_plan ON COMMIT DROP AS
  WITH classified AS (
    SELECT
      k.id, k.employee_id, k.kpi_name, k.review_year, k.frequency,
      k.review_period, k.frequency_cycle_start, k.created_at,
      public.resolve_cycle_anchor(
        k.frequency,
        array_position(
          ARRAY['January','February','March','April','May','June',
                'July','August','September','October','November','December'],
          k.review_period
        ) - 1
      ) AS canonical_window
    FROM public.kpis k
    WHERE k.frequency IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly')
      AND k.frequency_cycle_start IS NOT NULL
  ),
  oldest AS (
    SELECT DISTINCT ON (employee_id, kpi_name, review_year, frequency, canonical_window)
      employee_id, kpi_name, review_year, frequency, canonical_window,
      frequency_cycle_start AS authoritative_anchor
    FROM classified
    WHERE canonical_window IS NOT NULL
    ORDER BY employee_id, kpi_name, review_year, frequency, canonical_window,
             created_at ASC, id ASC
  ),
  drifted AS (
    SELECT employee_id, kpi_name, review_year, frequency, canonical_window
    FROM classified
    WHERE canonical_window IS NOT NULL
    GROUP BY 1,2,3,4,5
    HAVING count(DISTINCT frequency_cycle_start) > 1
  )
  SELECT
    c.id AS kpi_id, c.frequency, c.review_period, c.review_year,
    c.canonical_window, c.frequency_cycle_start AS current_anchor,
    o.authoritative_anchor,
    public.is_valid_cycle_anchor(c.frequency, o.authoritative_anchor) AS authoritative_is_valid
  FROM classified c
  JOIN drifted d USING (employee_id, kpi_name, review_year, frequency, canonical_window)
  JOIN oldest  o USING (employee_id, kpi_name, review_year, frequency, canonical_window)
  WHERE c.frequency_cycle_start IS DISTINCT FROM o.authoritative_anchor;

  SELECT count(*) INTO v_planned_count FROM tmp_anchor_repair_plan;
  IF v_planned_count > p_safety_ceiling THEN
    RAISE EXCEPTION 'Anchor repair aborted: % rows exceed safety ceiling of %', v_planned_count, p_safety_ceiling;
  END IF;
  SELECT count(*) INTO v_skipped_invalid
  FROM tmp_anchor_repair_plan WHERE NOT authoritative_is_valid;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'success', true, 'dry_run', true,
      'planned_updates', v_planned_count,
      'skipped_invalid_authoritative', v_skipped_invalid,
      'will_repair', v_planned_count - v_skipped_invalid
    );
  END IF;

  FOR rec IN SELECT * FROM tmp_anchor_repair_plan WHERE authoritative_is_valid LOOP
    UPDATE public.kpis SET frequency_cycle_start = rec.authoritative_anchor WHERE id = rec.kpi_id;
    INSERT INTO public.kpi_audit_logs (
      kpi_id, action, old_value, new_value, performed_by, metadata
    ) VALUES (
      rec.kpi_id, 'KPI_CYCLE_ANCHOR_REPAIRED',
      jsonb_build_object('frequency_cycle_start', rec.current_anchor),
      jsonb_build_object('frequency_cycle_start', rec.authoritative_anchor),
      NULL,
      jsonb_build_object(
        'frequency', rec.frequency,
        'review_period', rec.review_period,
        'review_year', rec.review_year,
        'cycle_window', rec.canonical_window,
        'system_action', true,
        'strategy', 'oldest_row_wins_per_window',
        'policy', 'ADR-091'
      )
    );
    v_repaired_count := v_repaired_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'dry_run', false,
    'planned_updates', v_planned_count,
    'skipped_invalid_authoritative', v_skipped_invalid,
    'repaired', v_repaired_count
  );
END $$;

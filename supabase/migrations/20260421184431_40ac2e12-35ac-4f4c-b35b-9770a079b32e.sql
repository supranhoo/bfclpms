-- ============================================================================
-- v2.66.7 — Forward-Sync of Org Status + Bi-Monthly Cascade Fix
-- ============================================================================

-- 1. Feature flag
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS enable_org_kpi_forward_sync boolean NOT NULL DEFAULT true;

-- 2. Helper: resolve terminal month for a given (period, year, frequency, sub_frequency)
--    For multi-month frequencies, returns the terminal calendar month + year of the
--    cycle that contains the given period. For Monthly/Daily/Weekly returns the input.
CREATE OR REPLACE FUNCTION public.resolve_terminal_period(
  p_period text,
  p_year integer,
  p_frequency text,
  p_sub_frequency text
) RETURNS TABLE(terminal_period text, terminal_year integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_month_idx int;  -- 1..12 calendar
  v_period_to_idx constant jsonb := '{
    "January":1,"February":2,"March":3,"April":4,"May":5,"June":6,
    "July":7,"August":8,"September":9,"October":10,"November":11,"December":12
  }'::jsonb;
  v_idx_to_period constant text[] := ARRAY[
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  v_terminal_idx int;
  v_terminal_year int;
BEGIN
  v_month_idx := (v_period_to_idx ->> p_period)::int;
  IF v_month_idx IS NULL THEN
    RETURN QUERY SELECT p_period, p_year;
    RETURN;
  END IF;

  IF p_frequency = 'Bi-Monthly' THEN
    -- Cycles: Feb-Mar, Apr-May, Jun-Jul, Aug-Sep, Oct-Nov, Dec-Jan (terminals: Mar,May,Jul,Sep,Nov,Jan)
    v_terminal_idx := CASE
      WHEN v_month_idx IN (2,3)  THEN 3
      WHEN v_month_idx IN (4,5)  THEN 5
      WHEN v_month_idx IN (6,7)  THEN 7
      WHEN v_month_idx IN (8,9)  THEN 9
      WHEN v_month_idx IN (10,11) THEN 11
      WHEN v_month_idx IN (12,1) THEN 1
      ELSE v_month_idx
    END;
    v_terminal_year := CASE
      WHEN v_month_idx = 12 AND v_terminal_idx = 1 THEN p_year + 1
      ELSE p_year
    END;
  ELSIF p_frequency = 'Quarterly' THEN
    v_terminal_idx := CASE
      WHEN v_month_idx BETWEEN 1 AND 3   THEN 3
      WHEN v_month_idx BETWEEN 4 AND 6   THEN 6
      WHEN v_month_idx BETWEEN 7 AND 9   THEN 9
      WHEN v_month_idx BETWEEN 10 AND 12 THEN 12
    END;
    v_terminal_year := p_year;
  ELSIF p_frequency = 'Half-Yearly' THEN
    v_terminal_idx := CASE WHEN v_month_idx BETWEEN 1 AND 6 THEN 6 ELSE 12 END;
    v_terminal_year := p_year;
  ELSIF p_frequency = 'Yearly' THEN
    v_terminal_idx := 12;
    v_terminal_year := p_year;
  ELSE
    v_terminal_idx := v_month_idx;
    v_terminal_year := p_year;
  END IF;

  RETURN QUERY SELECT v_idx_to_period[v_terminal_idx], v_terminal_year;
END;
$$;

-- 3. Forward-Sync trigger function
--    When a KPI's is_org_level or org_level_scope changes on an existing row,
--    cascade to sibling KPIs in future open periods (same employee_id + signature).
CREATE OR REPLACE FUNCTION public.fn_sync_org_status_to_future_open_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean;
  v_period_order constant text[] := ARRAY[
    'July','August','September','October','November','December',
    'January','February','March','April','May','June'
  ];
  v_old_idx int;
  v_target record;
  v_is_locked boolean;
  v_deleted_okv int := 0;
BEGIN
  -- Only act on actual change of org-level flag or scope
  IF NEW.is_org_level IS NOT DISTINCT FROM OLD.is_org_level
     AND NEW.org_level_scope IS NOT DISTINCT FROM OLD.org_level_scope THEN
    RETURN NEW;
  END IF;

  -- Feature flag check
  SELECT COALESCE(enable_org_kpi_forward_sync, true)
    INTO v_flag
    FROM public.app_settings
    WHERE id = '00000000-0000-0000-0000-000000000001';
  IF NOT COALESCE(v_flag, true) THEN
    RETURN NEW;
  END IF;

  -- Find anchor index in fiscal-year period order
  v_old_idx := array_position(v_period_order, NEW.review_period);
  IF v_old_idx IS NULL THEN
    RETURN NEW;
  END IF;

  -- Iterate matching sibling KPIs in future periods (same fiscal year context)
  FOR v_target IN
    SELECT k.id, k.review_period, k.review_year, k.is_org_level, k.org_level_scope
      FROM public.kpis k
     WHERE k.category_id = NEW.category_id
       AND k.kra_name    = NEW.kra_name
       AND k.kpi_name    = NEW.kpi_name
       AND k.employee_id = NEW.employee_id
       AND k.id <> NEW.id
       AND (
         (k.review_year > NEW.review_year)
         OR (k.review_year = NEW.review_year
             AND array_position(v_period_order, k.review_period) > v_old_idx)
       )
  LOOP
    -- Skip if target period is locked
    SELECT EXISTS(
      SELECT 1
        FROM public.review_period_locks rpl
        JOIN public.review_periods rp ON rp.id = rpl.review_period_id
       WHERE rp.month_name = v_target.review_period
         AND rp.year       = v_target.review_year
         AND rpl.is_locked = true
         AND rpl.lock_type IN ('global','full')
    ) INTO v_is_locked;

    IF v_is_locked THEN
      CONTINUE;
    END IF;

    -- Apply if differs
    IF v_target.is_org_level IS DISTINCT FROM NEW.is_org_level
       OR v_target.org_level_scope IS DISTINCT FROM NEW.org_level_scope THEN

      UPDATE public.kpis
         SET is_org_level    = NEW.is_org_level,
             org_level_scope = NEW.org_level_scope
       WHERE id = v_target.id;

      -- Demotion side-effect: clear orphan draft OKV rows in the target period
      IF NEW.is_org_level = false AND v_target.is_org_level = true THEN
        DELETE FROM public.org_kpi_values okv
         WHERE okv.category_id   = NEW.category_id
           AND okv.kra_name      = NEW.kra_name
           AND okv.kpi_name      = NEW.kpi_name
           AND okv.review_period = v_target.review_period
           AND okv.review_year   = v_target.review_year
           AND okv.status        = 'draft';
        GET DIAGNOSTICS v_deleted_okv = ROW_COUNT;
      END IF;

      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        v_target.id,
        'ORG_KPI_FORWARD_SYNCED',
        NULL,
        jsonb_build_object(
          'source_kpi_id',   NEW.id,
          'source_period',   NEW.review_period,
          'source_year',     NEW.review_year,
          'target_period',   v_target.review_period,
          'target_year',     v_target.review_year,
          'from_org_level',  v_target.is_org_level,
          'to_org_level',    NEW.is_org_level,
          'from_scope',      v_target.org_level_scope,
          'to_scope',        NEW.org_level_scope,
          'orphan_okv_deleted', v_deleted_okv,
          'system_action',   true
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_org_status_to_future_open_periods ON public.kpis;
CREATE TRIGGER trg_sync_org_status_to_future_open_periods
AFTER UPDATE OF is_org_level, org_level_scope ON public.kpis
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_org_status_to_future_open_periods();

-- 4. Patch change_org_kpi_scope_cascading: for multi-month frequencies, only cascade
--    to terminal months of each cycle within the same fiscal year.
CREATE OR REPLACE FUNCTION public.change_org_kpi_scope_cascading(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_base_period text,
  p_base_year integer,
  p_new_scope text,
  p_cascade_forward boolean DEFAULT false,
  p_dry_run boolean DEFAULT false,
  p_triggered_by uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period_order constant text[] := ARRAY[
    'July','August','September','October','November','December',
    'January','February','March','April','May','June'
  ];
  v_base_idx       integer;
  v_period         text;
  v_period_year    integer;
  v_old_scope      text;
  v_kpi_updates    integer;
  v_migration      jsonb;
  v_period_results jsonb := '[]'::jsonb;
  v_skipped        jsonb := '[]'::jsonb;
  v_is_locked      boolean;
  v_target_periods text[] := ARRAY[]::text[];
  v_target_years   integer[] := ARRAY[]::integer[];
  i                integer;
  v_frequency      text;
  v_sub_frequency  text;
  v_resolved_period text;
  v_resolved_year   integer;
  v_anchor_period   text;
  v_anchor_year     integer;
BEGIN
  v_base_idx := array_position(v_period_order, p_base_period);
  IF v_base_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid base period: %', p_base_period;
  END IF;

  -- Detect frequency from any matching org KPI row in the base context
  SELECT k.frequency, k.sub_frequency
    INTO v_frequency, v_sub_frequency
    FROM public.kpis k
   WHERE k.category_id = p_category_id
     AND k.kra_name    = p_kra_name
     AND k.kpi_name    = p_kpi_name
     AND k.is_org_level = true
   LIMIT 1;

  -- Resolve the base period to its terminal cycle anchor
  SELECT terminal_period, terminal_year
    INTO v_anchor_period, v_anchor_year
    FROM public.resolve_terminal_period(p_base_period, p_base_year, COALESCE(v_frequency,'Monthly'), v_sub_frequency);

  v_target_periods := array_append(v_target_periods, v_anchor_period);
  v_target_years   := array_append(v_target_years,   v_anchor_year);

  -- Forward cascade: walk each later month in fiscal year, resolve to terminal,
  -- de-duplicate so each cycle is touched only once.
  IF p_cascade_forward THEN
    FOR i IN (array_position(v_period_order, v_anchor_period) + 1) .. array_length(v_period_order, 1) LOOP
      v_period := v_period_order[i];
      IF i >= 7 THEN
        v_period_year := v_anchor_year + CASE WHEN array_position(v_period_order, v_anchor_period) <= 6 THEN 1 ELSE 0 END;
      ELSE
        v_period_year := v_anchor_year;
      END IF;

      SELECT terminal_period, terminal_year
        INTO v_resolved_period, v_resolved_year
        FROM public.resolve_terminal_period(v_period, v_period_year, COALESCE(v_frequency,'Monthly'), v_sub_frequency);

      -- Append only if not already present
      IF NOT (v_resolved_period = ANY(v_target_periods)
              AND v_resolved_year = ANY(v_target_years)) THEN
        v_target_periods := array_append(v_target_periods, v_resolved_period);
        v_target_years   := array_append(v_target_years,   v_resolved_year);
      END IF;
    END LOOP;
  END IF;

  -- Process each target period
  FOR i IN 1 .. array_length(v_target_periods, 1) LOOP
    v_period      := v_target_periods[i];
    v_period_year := v_target_years[i];

    SELECT EXISTS(
      SELECT 1 FROM public.review_period_locks rpl
      JOIN public.review_periods rp ON rp.id = rpl.review_period_id
      WHERE rp.month_name = v_period
        AND rp.year       = v_period_year
        AND rpl.is_locked = true
        AND rpl.lock_type IN ('global','full')
    ) INTO v_is_locked;

    IF v_is_locked THEN
      v_skipped := v_skipped || jsonb_build_object(
        'period', v_period, 'year', v_period_year, 'reason', 'period_locked'
      );
      CONTINUE;
    END IF;

    SELECT DISTINCT org_level_scope INTO v_old_scope
    FROM public.kpis
    WHERE category_id   = p_category_id
      AND kra_name      = p_kra_name
      AND kpi_name      = p_kpi_name
      AND review_period = v_period
      AND review_year   = v_period_year
      AND is_org_level  = true
    LIMIT 1;

    IF v_old_scope IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'period', v_period, 'year', v_period_year, 'reason', 'no_org_kpi_rows'
      );
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_period_results := v_period_results || jsonb_build_object(
        'period', v_period, 'year', v_period_year,
        'old_scope', v_old_scope, 'new_scope', p_new_scope,
        'preview', true,
        'frequency', v_frequency
      );
      CONTINUE;
    END IF;

    UPDATE public.kpis
       SET org_level_scope = p_new_scope
     WHERE category_id   = p_category_id
       AND kra_name      = p_kra_name
       AND kpi_name      = p_kpi_name
       AND review_period = v_period
       AND review_year   = v_period_year
       AND is_org_level  = true;
    GET DIAGNOSTICS v_kpi_updates = ROW_COUNT;

    v_migration := public.migrate_okv_on_scope_change(
      p_category_id, p_kra_name, p_kpi_name,
      v_period, v_period_year,
      v_old_scope, p_new_scope, p_triggered_by
    );

    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
    SELECT k.id,
           'ORG_KPI_SCOPE_CASCADED',
           p_triggered_by,
           jsonb_build_object(
             'old_scope',     v_old_scope,
             'new_scope',     p_new_scope,
             'period',        v_period,
             'year',          v_period_year,
             'frequency',     v_frequency,
             'cycle_anchor',  true,
             'kpi_updates',   v_kpi_updates,
             'okv_migration', v_migration
           )
    FROM public.kpis k
    WHERE k.category_id   = p_category_id
      AND k.kra_name      = p_kra_name
      AND k.kpi_name      = p_kpi_name
      AND k.review_period = v_period
      AND k.review_year   = v_period_year
      AND k.is_org_level  = true;

    v_period_results := v_period_results || jsonb_build_object(
      'period',        v_period,
      'year',          v_period_year,
      'old_scope',     v_old_scope,
      'new_scope',     p_new_scope,
      'kpi_updates',   v_kpi_updates,
      'okv_migration', v_migration
    );
  END LOOP;

  RETURN jsonb_build_object(
    'periods',   v_period_results,
    'skipped',   v_skipped,
    'frequency', v_frequency,
    'anchor',    jsonb_build_object('period', v_anchor_period, 'year', v_anchor_year)
  );
END;
$function$;
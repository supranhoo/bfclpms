-- =====================================================================
-- BUG-027 — Fix: Org-level KPI scope toggle fails with
--   "column rp.month_name does not exist"
--
-- Root cause: two functions reference review_periods.month_name and
-- review_periods.year, but the actual columns are period_name and
-- review_year. This blocks ANY update to kpis.is_org_level or
-- kpis.org_level_scope (the AFTER UPDATE trigger fires on those
-- columns) and also breaks public.change_org_kpi_scope_cascading.
--
-- Fix: redefine both functions with the correct column names. Bodies
-- are byte-equivalent to the prior versions (migrations 20260421181848
-- and 20260421184431) except for the two corrected columns.
-- =====================================================================

-- 1) Trigger function on kpis: propagate Org-level changes forward
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
  IF NEW.is_org_level IS NOT DISTINCT FROM OLD.is_org_level
     AND NEW.org_level_scope IS NOT DISTINCT FROM OLD.org_level_scope THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(enable_org_kpi_forward_sync, true)
    INTO v_flag
    FROM public.app_settings
    WHERE id = '00000000-0000-0000-0000-000000000001';
  IF NOT COALESCE(v_flag, true) THEN
    RETURN NEW;
  END IF;

  v_old_idx := array_position(v_period_order, NEW.review_period);
  IF v_old_idx IS NULL THEN
    RETURN NEW;
  END IF;

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
    SELECT EXISTS(
      SELECT 1
        FROM public.review_period_locks rpl
        JOIN public.review_periods rp ON rp.id = rpl.review_period_id
       WHERE rp.period_name = v_target.review_period      -- FIXED (was rp.month_name)
         AND rp.review_year = v_target.review_year         -- FIXED (was rp.year)
         AND rpl.is_locked  = true
         AND rpl.lock_type  IN ('global','full')
    ) INTO v_is_locked;

    IF v_is_locked THEN
      CONTINUE;
    END IF;

    IF v_target.is_org_level IS DISTINCT FROM NEW.is_org_level
       OR v_target.org_level_scope IS DISTINCT FROM NEW.org_level_scope THEN

      UPDATE public.kpis
         SET is_org_level    = NEW.is_org_level,
             org_level_scope = NEW.org_level_scope
       WHERE id = v_target.id;

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

-- 2) RPC: change_org_kpi_scope_cascading — same column rename
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

  SELECT k.frequency, k.sub_frequency
    INTO v_frequency, v_sub_frequency
    FROM public.kpis k
   WHERE k.category_id = p_category_id
     AND k.kra_name    = p_kra_name
     AND k.kpi_name    = p_kpi_name
     AND k.is_org_level = true
   LIMIT 1;

  SELECT terminal_period, terminal_year
    INTO v_anchor_period, v_anchor_year
    FROM public.resolve_terminal_period(p_base_period, p_base_year, COALESCE(v_frequency,'Monthly'), v_sub_frequency);

  v_target_periods := array_append(v_target_periods, v_anchor_period);
  v_target_years   := array_append(v_target_years,   v_anchor_year);

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

      IF NOT (v_resolved_period = ANY(v_target_periods)
              AND v_resolved_year = ANY(v_target_years)) THEN
        v_target_periods := array_append(v_target_periods, v_resolved_period);
        v_target_years   := array_append(v_target_years,   v_resolved_year);
      END IF;
    END LOOP;
  END IF;

  FOR i IN 1 .. array_length(v_target_periods, 1) LOOP
    v_period      := v_target_periods[i];
    v_period_year := v_target_years[i];

    SELECT EXISTS(
      SELECT 1 FROM public.review_period_locks rpl
      JOIN public.review_periods rp ON rp.id = rpl.review_period_id
      WHERE rp.period_name = v_period           -- FIXED (was rp.month_name)
        AND rp.review_year = v_period_year       -- FIXED (was rp.year)
        AND rpl.is_locked  = true
        AND rpl.lock_type  IN ('global','full')
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
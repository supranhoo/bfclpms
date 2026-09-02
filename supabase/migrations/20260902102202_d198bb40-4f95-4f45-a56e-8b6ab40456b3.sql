CREATE OR REPLACE FUNCTION public.change_org_kpi_scope_cascading(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_base_period text,
  p_base_year integer,
  p_new_scope text,
  p_cascade_forward boolean DEFAULT false,
  p_dry_run boolean DEFAULT false,
  p_triggered_by uuid DEFAULT NULL::uuid,
  p_new_target uuid DEFAULT NULL::uuid,
  p_seed_missing boolean DEFAULT false
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
  v_seeded_rows    integer;
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
  v_new_grouped    boolean := p_new_scope IN ('division','business_unit','location','pms_grade','level');
  v_reach          integer;
  v_seeded         boolean;
  v_locked_count   integer := 0;
  v_missing_count  integer := 0;
BEGIN
  v_base_idx := array_position(v_period_order, p_base_period);
  IF v_base_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid base period: %', p_base_period;
  END IF;

  -- ADR-320 guardrail: a grouped scope must name a target that reaches people.
  IF v_new_grouped THEN
    IF p_new_target IS NULL THEN
      RAISE EXCEPTION 'Choose which % this KPI moves to.', replace(p_new_scope, '_', ' ');
    END IF;
    SELECT count(*) INTO v_reach
    FROM public.resolve_scope_population(
      p_new_scope,
      CASE WHEN p_new_scope = 'division'      THEN p_new_target END,
      CASE WHEN p_new_scope = 'business_unit' THEN p_new_target END,
      NULL,
      CASE WHEN p_new_scope = 'location'      THEN p_new_target END,
      CASE WHEN p_new_scope = 'pms_grade'     THEN p_new_target END,
      CASE WHEN p_new_scope = 'level'         THEN p_new_target END,
      NULL
    );
    IF COALESCE(v_reach, 0) = 0 THEN
      RAISE EXCEPTION 'That % has no active employees, so the KPI would reach nobody.', replace(p_new_scope, '_', ' ');
    END IF;
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
    v_seeded      := false;
    v_seeded_rows := 0;

    SELECT EXISTS(
      SELECT 1 FROM public.review_period_locks rpl
      JOIN public.review_periods rp ON rp.id = rpl.review_period_id
      WHERE rp.period_name = v_period
        AND rp.review_year = v_period_year
        AND rpl.is_locked  = true
        AND rpl.lock_type  IN ('global','full')
    ) INTO v_is_locked;

    IF v_is_locked THEN
      v_locked_count := v_locked_count + 1;
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
      -- ADR-344 — the month simply has no row for this KPI. Report it as such,
      -- and only create it when the admin explicitly asked for that.
      IF NOT p_seed_missing THEN
        v_missing_count := v_missing_count + 1;
        v_skipped := v_skipped || jsonb_build_object(
          'period', v_period, 'year', v_period_year, 'reason', 'no_org_kpi_rows'
        );
        CONTINUE;
      END IF;

      IF p_dry_run THEN
        v_period_results := v_period_results || jsonb_build_object(
          'period', v_period, 'year', v_period_year,
          'old_scope', NULL, 'new_scope', p_new_scope,
          'new_target', p_new_target,
          'preview', true, 'seeded', true,
          'frequency', v_frequency
        );
        CONTINUE;
      END IF;

      INSERT INTO public.kpis (
        category_id, employee_id, kra_name, kpi_name, uom, criteria, target_value,
        weightage, review_period, review_year, r5, r4, r3, r2, r1, r0,
        frequency, source_of_data, is_org_level, uom_type, qualitative_options,
        org_level_scope, sub_frequency, frequency_cycle_start, is_frequency_locked,
        require_resubmit_reason, day_count_type, threshold_mode, ref_code,
        source_template_id, kpi_definition_id, kpi_group_type,
        division_id, business_unit_id, location_id, pms_grade_id, level_id,
        kpi_title, kpi_description, kpi_formula, kpi_scoring_logic
      )
      SELECT
        src.category_id, src.employee_id, src.kra_name, src.kpi_name, src.uom, src.criteria, src.target_value,
        src.weightage, v_period, v_period_year, src.r5, src.r4, src.r3, src.r2, src.r1, src.r0,
        src.frequency, src.source_of_data, true, src.uom_type, src.qualitative_options,
        p_new_scope, src.sub_frequency, src.frequency_cycle_start, src.is_frequency_locked,
        src.require_resubmit_reason, src.day_count_type, src.threshold_mode, src.ref_code,
        src.source_template_id, src.kpi_definition_id, src.kpi_group_type,
        CASE WHEN p_new_scope = 'division'      THEN p_new_target END,
        CASE WHEN p_new_scope = 'business_unit' THEN p_new_target END,
        CASE WHEN p_new_scope = 'location'      THEN p_new_target END,
        CASE WHEN p_new_scope = 'pms_grade'     THEN p_new_target END,
        CASE WHEN p_new_scope = 'level'         THEN p_new_target END,
        src.kpi_title, src.kpi_description, src.kpi_formula, src.kpi_scoring_logic
      FROM public.kpis src
      WHERE src.category_id   = p_category_id
        AND src.kra_name      = p_kra_name
        AND src.kpi_name      = p_kpi_name
        AND src.review_period = v_anchor_period
        AND src.review_year   = v_anchor_year
        AND src.is_org_level  = true
        AND NOT EXISTS (
          SELECT 1 FROM public.kpis dup
          WHERE dup.category_id   = src.category_id
            AND dup.kra_name      = src.kra_name
            AND dup.kpi_name      = src.kpi_name
            AND dup.employee_id   = src.employee_id
            AND dup.review_period = v_period
            AND dup.review_year   = v_period_year
        );
      GET DIAGNOSTICS v_seeded_rows = ROW_COUNT;

      IF v_seeded_rows = 0 THEN
        v_missing_count := v_missing_count + 1;
        v_skipped := v_skipped || jsonb_build_object(
          'period', v_period, 'year', v_period_year, 'reason', 'no_org_kpi_rows'
        );
        CONTINUE;
      END IF;

      v_seeded    := true;
      v_old_scope := p_new_scope;
    END IF;

    IF p_dry_run THEN
      v_period_results := v_period_results || jsonb_build_object(
        'period', v_period, 'year', v_period_year,
        'old_scope', v_old_scope, 'new_scope', p_new_scope,
        'new_target', p_new_target,
        'preview', true,
        'frequency', v_frequency
      );
      CONTINUE;
    END IF;

    UPDATE public.kpis
       SET org_level_scope = p_new_scope,
           division_id      = CASE WHEN p_new_scope = 'division'      THEN p_new_target ELSE NULL END,
           business_unit_id = CASE WHEN p_new_scope = 'business_unit' THEN p_new_target ELSE NULL END,
           location_id      = CASE WHEN p_new_scope = 'location'      THEN p_new_target ELSE NULL END,
           pms_grade_id     = CASE WHEN p_new_scope = 'pms_grade'     THEN p_new_target ELSE NULL END,
           level_id         = CASE WHEN p_new_scope = 'level'         THEN p_new_target ELSE NULL END
     WHERE category_id   = p_category_id
       AND kra_name      = p_kra_name
       AND kpi_name      = p_kpi_name
       AND review_period = v_period
       AND review_year   = v_period_year
       AND is_org_level  = true;
    GET DIAGNOSTICS v_kpi_updates = ROW_COUNT;

    IF v_new_grouped
       OR v_old_scope IN ('division','business_unit','location','pms_grade','level') THEN
      v_migration := public.migrate_okv_scope_generic(
        p_category_id, p_kra_name, p_kpi_name,
        v_period, v_period_year,
        v_old_scope, p_new_scope, NULL, p_new_target, p_triggered_by
      );
    ELSE
      v_migration := public.migrate_okv_on_scope_change(
        p_category_id, p_kra_name, p_kpi_name,
        v_period, v_period_year,
        v_old_scope, p_new_scope, p_triggered_by
      );
    END IF;

    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
    SELECT k.id,
           'ORG_KPI_SCOPE_CASCADED',
           p_triggered_by,
           jsonb_build_object(
             'old_scope',     v_old_scope,
             'new_scope',     p_new_scope,
             'new_target',    p_new_target,
             'period',        v_period,
             'year',          v_period_year,
             'frequency',     v_frequency,
             'cycle_anchor',  true,
             'kpi_updates',   v_kpi_updates,
             'seeded',        v_seeded,
             'seeded_rows',   v_seeded_rows,
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
      'new_target',    p_new_target,
      'kpi_updates',   v_kpi_updates,
      'seeded',        v_seeded,
      'seeded_rows',   v_seeded_rows,
      'okv_migration', v_migration
    );
  END LOOP;

  RETURN jsonb_build_object(
    'periods',   v_period_results,
    'skipped',   v_skipped,
    'skipped_summary', jsonb_build_object(
      'period_locked',   v_locked_count,
      'no_org_kpi_rows', v_missing_count
    ),
    'frequency', v_frequency,
    'anchor',    jsonb_build_object('period', v_anchor_period, 'year', v_anchor_year)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_org_kpi_scope_cascading(uuid, text, text, text, integer, text, boolean, boolean, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_org_kpi_scope_cascading(uuid, text, text, text, integer, text, boolean, boolean, uuid, uuid, boolean) TO service_role;
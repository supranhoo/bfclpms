-- ADR-322 correction — on `kpis` only the five grouped scopes carry a target id
-- (kpis_scope_target_check); department / employee resolve from the row's own
-- employee, so those columns must never be written by a group edit.

CREATE OR REPLACE FUNCTION public.bu_console_editable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT ARRAY[
    'kpi_title','kpi_description','kpi_formula','kpi_scoring_logic',
    'weightage','target_value','uom','uom_type','frequency','threshold_mode',
    'qualitative_options','r5','r4','r3','r2','r1','r0',
    'kra_name','category_id','criteria','source_of_data',
    'frequency_cycle_start','day_count_type','is_org_level','org_level_scope',
    'require_resubmit_reason','is_frequency_locked',
    -- ADR-322 — a grouped scope owns exactly one target id.
    'business_unit_id','location_id','division_id','pms_grade_id','level_id'
  ]::text[]
$function$;

-- The target column a scope owns *on the kpis table*.
CREATE OR REPLACE FUNCTION public.bu_console_scope_target_column(p_scope text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE p_scope
    WHEN 'division'      THEN 'division_id'
    WHEN 'business_unit' THEN 'business_unit_id'
    WHEN 'location'      THEN 'location_id'
    WHEN 'pms_grade'     THEN 'pms_grade_id'
    WHEN 'level'         THEN 'level_id'
    ELSE NULL  -- organization / department / employee resolve without a target
  END
$function$;

CREATE OR REPLACE FUNCTION public.bu_console_validate_changes(p_changes jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_freq text;
  v_anchor text;
  v_scope text;
  v_target_col text;
  v_target text;
  v_col text;
  v_reach int;
  v_all_target_cols text[] := ARRAY[
    'business_unit_id','location_id','division_id','pms_grade_id','level_id'
  ];
BEGIN
  IF p_changes IS NULL THEN RETURN; END IF;

  v_freq := NULLIF(btrim(COALESCE(p_changes->>'frequency','')), '');

  IF v_freq IS NOT NULL AND v_freq IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    IF NOT (p_changes ? 'frequency_cycle_start')
       OR NULLIF(btrim(COALESCE(p_changes->>'frequency_cycle_start','')), '') IS NULL THEN
      RAISE EXCEPTION 'A % KPI needs a cycle anchor (e.g. Jan-Feb). Pick the cycle before applying.', v_freq;
    END IF;
  END IF;

  IF v_freq IS NOT NULL AND v_freq NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    v_anchor := NULLIF(btrim(COALESCE(p_changes->>'frequency_cycle_start','')), '');
    IF v_anchor IS NOT NULL THEN
      RAISE EXCEPTION 'A % KPI cannot carry a multi-month cycle anchor.', v_freq;
    END IF;
  END IF;

  IF (p_changes ? 'day_count_type')
     AND NULLIF(btrim(COALESCE(p_changes->>'day_count_type','')), '') IS NOT NULL
     AND COALESCE(p_changes->>'day_count_type','') NOT IN ('working_days','all_days') THEN
    RAISE EXCEPTION 'Day counting must be working_days or all_days.';
  END IF;

  -- ADR-322 — scope vocabulary and its single target id.
  IF p_changes ? 'org_level_scope' THEN
    v_scope := NULLIF(btrim(COALESCE(p_changes->>'org_level_scope','')), '');

    IF v_scope IS NOT NULL AND v_scope NOT IN (
      'organization','department','employee','business_unit','location','division','pms_grade','level'
    ) THEN
      RAISE EXCEPTION 'Unknown KPI scope "%". Pick a scope from the list.', v_scope;
    END IF;

    v_target_col := public.bu_console_scope_target_column(v_scope);

    IF v_target_col IS NOT NULL THEN
      v_target := NULLIF(btrim(COALESCE(p_changes->>v_target_col,'')), '');
      IF v_target IS NULL THEN
        RAISE EXCEPTION 'The % scope needs a target. Choose which one this KPI applies to.',
          replace(v_scope, '_', ' ');
      END IF;

      SELECT count(*)::int INTO v_reach
      FROM public.resolve_scope_population(
        v_scope,
        CASE WHEN v_target_col = 'division_id'      THEN v_target::uuid END,
        CASE WHEN v_target_col = 'business_unit_id' THEN v_target::uuid END,
        NULL,
        CASE WHEN v_target_col = 'location_id'      THEN v_target::uuid END,
        CASE WHEN v_target_col = 'pms_grade_id'     THEN v_target::uuid END,
        CASE WHEN v_target_col = 'level_id'         THEN v_target::uuid END,
        NULL, NULL, NULL
      );

      IF COALESCE(v_reach, 0) = 0 THEN
        RAISE EXCEPTION 'That % has no active employees — the KPI would reach nobody.',
          replace(v_scope, '_', ' ');
      END IF;
    END IF;

    -- No foreign target may travel with the scope.
    FOREACH v_col IN ARRAY v_all_target_cols
    LOOP
      IF (p_changes ? v_col)
         AND NULLIF(btrim(COALESCE(p_changes->>v_col,'')), '') IS NOT NULL
         AND (v_target_col IS NULL OR v_col <> v_target_col) THEN
        RAISE EXCEPTION 'A % KPI cannot also carry a % target.',
          replace(COALESCE(v_scope, 'individual'), '_', ' '), replace(v_col, '_id', '');
      END IF;
    END LOOP;
  END IF;
END;
$function$;
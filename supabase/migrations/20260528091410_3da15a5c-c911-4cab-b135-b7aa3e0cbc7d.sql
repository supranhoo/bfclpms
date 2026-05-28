-- =========================================================================
-- Step 3b.1: Scope-aware materialization of per-employee KPI rows
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) NEW: materialize_kpis_for_org_kpi
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.materialize_kpis_for_org_kpi(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  v_template kpis%ROWTYPE;
  v_scope_rec record;
  v_emp_id uuid;
  v_materialized int := 0;
  v_already int := 0;
  v_scope_targets int := 0;
  v_skipped_no_template int := 0;
  v_new_kpi_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- AuthZ: admin OR data owner for this KPI tuple
  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = p_category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to materialise KPI rows for this org KPI';
  END IF;

  -- Find a template: any existing sibling org-level kpis row for this tuple.
  -- We clone definition columns from it (target, UOM, scale, frequency, etc.)
  SELECT *
    INTO v_template
  FROM kpis k
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND normalize_kpi_text(k.kra_name) = v_kra_norm
    AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
  ORDER BY k.created_at ASC
  LIMIT 1;

  IF v_template.id IS NULL THEN
    -- No template kpis row yet. Cannot synthesise a definition out of OKV alone.
    RETURN jsonb_build_object(
      'materialized', 0,
      'already_existed', 0,
      'scope_targets_processed', 0,
      'skipped_no_template', 1,
      'reason', 'no_template_kpi_row'
    );
  END IF;

  -- Walk every distinct scope target defined on OKV rows for this tuple.
  -- Each OKV row carries one scope kind + matching target FK
  -- (enforced by org_kpi_values_scope_check from Step 2).
  FOR v_scope_rec IN
    SELECT DISTINCT
      v.org_level_scope,
      v.division_id,
      v.business_unit_id,
      v.department_id,
      v.location_id,
      v.pms_grade_id,
      v.level_id,
      v.employee_id
    FROM org_kpi_values v
    WHERE v.category_id = p_category_id
      AND normalize_kpi_text(v.kra_name) = v_kra_norm
      AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
      AND v.review_period = p_review_period
      AND v.review_year = p_review_year
  LOOP
    v_scope_targets := v_scope_targets + 1;

    -- Resolve the active-employee population for this scope target.
    FOR v_emp_id IN
      SELECT employee_id
      FROM public.resolve_scope_population(
        COALESCE(v_scope_rec.org_level_scope, 'organization'),
        v_scope_rec.division_id,
        v_scope_rec.business_unit_id,
        v_scope_rec.department_id,
        v_scope_rec.location_id,
        v_scope_rec.pms_grade_id,
        v_scope_rec.level_id,
        v_scope_rec.employee_id,
        p_review_period,
        p_review_year
      )
    LOOP
      -- Skip if a kpis row already exists for this employee + tuple.
      IF EXISTS (
        SELECT 1 FROM kpis k
        WHERE k.category_id = p_category_id
          AND normalize_kpi_text(k.kra_name) = v_kra_norm
          AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
          AND k.review_period = p_review_period
          AND k.review_year = p_review_year
          AND k.employee_id = v_emp_id
      ) THEN
        v_already := v_already + 1;
        CONTINUE;
      END IF;

      -- Materialize a new kpis row by cloning the template's definition columns.
      INSERT INTO kpis (
        category_id, employee_id, kra_name, kpi_name,
        uom, criteria, target_value, weightage,
        review_period, review_year, status,
        r5, r4, r3, r2, r1, r0,
        frequency, source_of_data, is_org_level, uom_type,
        qualitative_options, org_level_scope,
        sub_frequency, frequency_cycle_start, is_frequency_locked,
        require_resubmit_reason, day_count_type, threshold_mode,
        ref_code, is_issued, kpi_group_type,
        source_template_id, kpi_definition_id,
        -- Stamp the scope target on the new row so RLS/reporting can see it.
        division_id, business_unit_id, location_id, pms_grade_id, level_id
      )
      VALUES (
        p_category_id, v_emp_id, v_template.kra_name, v_template.kpi_name,
        v_template.uom, v_template.criteria, v_template.target_value, v_template.weightage,
        p_review_period, p_review_year, 'kra_set'::review_status,
        v_template.r5, v_template.r4, v_template.r3, v_template.r2, v_template.r1, v_template.r0,
        v_template.frequency, v_template.source_of_data, true, v_template.uom_type,
        v_template.qualitative_options,
        COALESCE(v_scope_rec.org_level_scope, v_template.org_level_scope),
        v_template.sub_frequency, v_template.frequency_cycle_start, v_template.is_frequency_locked,
        v_template.require_resubmit_reason, v_template.day_count_type, v_template.threshold_mode,
        v_template.ref_code, v_template.is_issued, v_template.kpi_group_type,
        v_template.source_template_id, v_template.kpi_definition_id,
        v_scope_rec.division_id, v_scope_rec.business_unit_id,
        v_scope_rec.location_id, v_scope_rec.pms_grade_id, v_scope_rec.level_id
      )
      RETURNING id INTO v_new_kpi_id;

      v_materialized := v_materialized + 1;

      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        v_new_kpi_id,
        'ORG_KPI_KPI_ROW_MATERIALIZED',
        v_user,
        jsonb_build_object(
          'category_id', p_category_id,
          'kra_name', p_kra_name,
          'kpi_name', p_kpi_name,
          'review_period', p_review_period,
          'review_year', p_review_year,
          'scope', COALESCE(v_scope_rec.org_level_scope, 'organization'),
          'scope_target', jsonb_strip_nulls(jsonb_build_object(
            'division_id', v_scope_rec.division_id,
            'business_unit_id', v_scope_rec.business_unit_id,
            'department_id', v_scope_rec.department_id,
            'location_id', v_scope_rec.location_id,
            'pms_grade_id', v_scope_rec.pms_grade_id,
            'level_id', v_scope_rec.level_id,
            'employee_id', v_scope_rec.employee_id
          )),
          'template_kpi_id', v_template.id,
          'employee_id', v_emp_id
        )
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'materialized', v_materialized,
    'already_existed', v_already,
    'scope_targets_processed', v_scope_targets,
    'skipped_no_template', v_skipped_no_template
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.materialize_kpis_for_org_kpi(uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_kpis_for_org_kpi(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_kpis_for_org_kpi(uuid, text, text, text, integer) TO service_role;

-- -------------------------------------------------------------------------
-- 2) TOUCH: ensure_org_kpi_scope_rows — call materialize first
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_org_kpi_scope_rows(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  v_created int := 0;
  v_evidence_seeded int := 0;
  v_already int := 0;
  v_emp record;
  v_okv_id uuid;
  v_was_new boolean;
  v_self_urls jsonb;
  v_self_url text;
  v_existing_urls jsonb;
  v_existing_url text;
  v_materialize_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = p_category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to materialise org KPI scope rows';
  END IF;

  -- STEP 3b.1: Materialize any missing per-employee kpis rows for the
  -- resolved scope population BEFORE seeding OKV rows. This ensures
  -- employees newly in scope (e.g. just added to a Division or PMS Grade)
  -- get a kpis row and therefore receive an OKV placeholder + downstream
  -- propagation.
  v_materialize_result := public.materialize_kpis_for_org_kpi(
    p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year
  );

  FOR v_emp IN
    SELECT DISTINCT k.employee_id, p.department_id, k.id AS kpi_id
    FROM kpis k
    LEFT JOIN profiles p ON p.id = k.employee_id
    WHERE k.is_org_level = true
      AND k.category_id = p_category_id
      AND k.review_period = p_review_period
      AND k.review_year = p_review_year
      AND normalize_kpi_text(k.kra_name) = v_kra_norm
      AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
      AND k.employee_id IS NOT NULL
  LOOP
    v_was_new := false;
    v_okv_id := NULL;

    SELECT v.id, v.evidence_urls, v.evidence_url
      INTO v_okv_id, v_existing_urls, v_existing_url
    FROM org_kpi_values v
    WHERE v.category_id = p_category_id
      AND normalize_kpi_text(v.kra_name) = v_kra_norm
      AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
      AND v.review_period = p_review_period
      AND v.review_year = p_review_year
      AND v.employee_id = v_emp.employee_id
    LIMIT 1;

    IF v_okv_id IS NULL THEN
      INSERT INTO org_kpi_values (
        category_id, kra_name, kpi_name,
        review_period, review_year,
        department_id, employee_id,
        achieved_value, is_na, status,
        entered_by
      )
      VALUES (
        p_category_id, p_kra_name, p_kpi_name,
        p_review_period, p_review_year,
        v_emp.department_id, v_emp.employee_id,
        NULL, false, 'entered',
        NULL
      )
      ON CONFLICT (
        category_id, kra_name, kpi_name, review_period, review_year,
        COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)
      ) DO NOTHING
      RETURNING id INTO v_okv_id;

      IF v_okv_id IS NOT NULL THEN
        v_created := v_created + 1;
        v_was_new := true;
        v_existing_urls := '[]'::jsonb;
        v_existing_url := NULL;
      ELSE
        SELECT v.id, v.evidence_urls, v.evidence_url
          INTO v_okv_id, v_existing_urls, v_existing_url
        FROM org_kpi_values v
        WHERE v.category_id = p_category_id
          AND normalize_kpi_text(v.kra_name) = v_kra_norm
          AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
          AND v.review_period = p_review_period
          AND v.review_year = p_review_year
          AND v.employee_id = v_emp.employee_id
        LIMIT 1;
        v_already := v_already + 1;
      END IF;
    ELSE
      v_already := v_already + 1;
    END IF;

    IF v_okv_id IS NOT NULL
       AND (v_existing_url IS NULL)
       AND (v_existing_urls IS NULL OR jsonb_array_length(COALESCE(v_existing_urls, '[]'::jsonb)) = 0) THEN
      SELECT rs.self_evidence_urls, rs.self_evidence_url
        INTO v_self_urls, v_self_url
      FROM review_submissions rs
      WHERE rs.kpi_id = v_emp.kpi_id
      LIMIT 1;

      IF (v_self_urls IS NOT NULL AND jsonb_array_length(COALESCE(v_self_urls, '[]'::jsonb)) > 0)
         OR (v_self_url IS NOT NULL AND length(trim(v_self_url)) > 0) THEN
        UPDATE org_kpi_values
        SET evidence_urls = CASE
              WHEN v_self_urls IS NOT NULL AND jsonb_array_length(COALESCE(v_self_urls, '[]'::jsonb)) > 0
                THEN v_self_urls
              ELSE jsonb_build_array(v_self_url)
            END
        WHERE id = v_okv_id;
        v_evidence_seeded := v_evidence_seeded + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'evidence_seeded', v_evidence_seeded,
    'already_existed', v_already,
    'materialize', v_materialize_result
  );
END;
$function$;

-- -------------------------------------------------------------------------
-- 3) TOUCH: diagnose_org_kpi_propagation_gap — add scope_member_without_kpi_row
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diagnose_org_kpi_propagation_gap(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer
)
RETURNS TABLE(
  kpi_id uuid,
  employee_id uuid,
  full_name text,
  employee_code text,
  department_name text,
  kpi_status text,
  okv_status text,
  okv_achieved numeric,
  okv_is_na boolean,
  has_review_submission boolean,
  rs_self_score numeric,
  classification text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
  v_locked_statuses text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review','approved'
  ];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = p_category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to inspect this org KPI';
  END IF;

  RETURN QUERY
  -- Existing kpis-driven rows (3 original scopes + any pre-existing rows).
  SELECT
    k.id AS kpi_id,
    k.employee_id,
    p.full_name,
    p.employee_code,
    d.name AS department_name,
    k.status::text AS kpi_status,
    v.status AS okv_status,
    v.achieved_value AS okv_achieved,
    COALESCE(v.is_na, false) AS okv_is_na,
    (rs.kpi_id IS NOT NULL) AS has_review_submission,
    rs.self_score AS rs_self_score,
    CASE
      WHEN rs.kpi_id IS NOT NULL AND rs.self_score IS NOT NULL THEN 'already_propagated'
      WHEN v.id IS NULL THEN 'missing_staging_value'
      WHEN v.achieved_value IS NULL AND COALESCE(v.is_na,false) = false THEN 'staging_value_blank'
      WHEN k.status::text = ANY(v_locked_statuses) THEN 'reviewer_locked'
      ELSE 'eligible_to_repair'
    END AS classification,
    CASE
      WHEN rs.kpi_id IS NOT NULL AND rs.self_score IS NOT NULL THEN 'review_submissions row already exists'
      WHEN v.id IS NULL THEN 'no org_kpi_values entry for this employee'
      WHEN v.achieved_value IS NULL AND COALESCE(v.is_na,false) = false THEN 'org_kpi_values exists but value is blank and not marked N/A'
      WHEN k.status::text = ANY(v_locked_statuses) THEN 'KPI workflow status ('||k.status::text||') is locked by reviewer'
      ELSE 'eligible — value entered, KPI in '||k.status::text
    END AS reason
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN org_kpi_values v
    ON v.category_id = k.category_id
   AND v.employee_id = k.employee_id
   AND v.review_period = k.review_period
   AND v.review_year = k.review_year
   AND normalize_kpi_text(v.kra_name) = v_kra_norm
   AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
  LEFT JOIN review_submissions rs ON rs.kpi_id = k.id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) = v_kra_norm
    AND normalize_kpi_text(k.kpi_name) = v_kpi_norm

  UNION ALL

  -- NEW: employees who are in the resolved scope population for at least
  -- one OKV scope target on this tuple but have NO kpis row yet.
  -- Surfacing them lets admins click "Materialize missing rows".
  SELECT
    NULL::uuid AS kpi_id,
    pop.employee_id,
    p.full_name,
    p.employee_code,
    d.name AS department_name,
    NULL::text AS kpi_status,
    NULL::text AS okv_status,
    NULL::numeric AS okv_achieved,
    false AS okv_is_na,
    false AS has_review_submission,
    NULL::numeric AS rs_self_score,
    'scope_member_without_kpi_row'::text AS classification,
    'Employee is in resolved scope population but has no kpis row — run materialize_kpis_for_org_kpi'::text AS reason
  FROM (
    SELECT DISTINCT pop.employee_id
    FROM (
      SELECT DISTINCT
        v.org_level_scope, v.division_id, v.business_unit_id,
        v.department_id, v.location_id, v.pms_grade_id, v.level_id, v.employee_id
      FROM org_kpi_values v
      WHERE v.category_id = p_category_id
        AND normalize_kpi_text(v.kra_name) = v_kra_norm
        AND normalize_kpi_text(v.kpi_name) = v_kpi_norm
        AND v.review_period = p_review_period
        AND v.review_year = p_review_year
    ) targets
    CROSS JOIN LATERAL public.resolve_scope_population(
      COALESCE(targets.org_level_scope, 'organization'),
      targets.division_id, targets.business_unit_id, targets.department_id,
      targets.location_id, targets.pms_grade_id, targets.level_id,
      targets.employee_id, p_review_period, p_review_year
    ) pop
  ) pop
  LEFT JOIN profiles p ON p.id = pop.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE NOT EXISTS (
    SELECT 1 FROM kpis k2
    WHERE k2.is_org_level = true
      AND k2.category_id = p_category_id
      AND k2.review_period = p_review_period
      AND k2.review_year = p_review_year
      AND normalize_kpi_text(k2.kra_name) = v_kra_norm
      AND normalize_kpi_text(k2.kpi_name) = v_kpi_norm
      AND k2.employee_id = pop.employee_id
  );
END;
$function$;
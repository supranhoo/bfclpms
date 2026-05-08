
-- ============================================================
-- Org KPI propagation: lock-list enum fix + diagnose + repair RPCs
-- RCA 2026-05-08:
--   - propagate_org_kpi_value used non-existent statuses
--     ('auditor_check','final'); replaced with the actual review_status
--     enum values (audit, management_review, skip_level_check,
--     hr_pms_review, approved, manager_check).
--   - Per-employee scope propagation iterates only the rows visible
--     in the UI, so rows the data hook did not load were NEVER
--     submitted to the RPC. We now expose a server-side repair RPC
--     that uses the canonical resolver to write review_submissions
--     for every entered org_kpi_values row that is still workflow-
--     eligible.
-- ============================================================

-- 1) Patch propagate_org_kpi_value: real enum lock list
CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(
  p_kpi_ratings jsonb,
  p_is_na boolean DEFAULT false,
  p_remarks text DEFAULT NULL::text,
  p_overwrite_policy text DEFAULT 'pre_review_only'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  old_score numeric;
  v_current_status text;
  v_row_count int;
  result jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  propagated_count int := 0;
  skipped_count int := 0;
  v_evidence_url text;
  v_evidence_urls jsonb;
  v_user uuid;
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_allow_overwrite boolean;
  v_target_status text;
  v_kpi_id uuid;
  v_self_score numeric;
  v_achieved_value numeric;
  -- Canonical lock list from review_status enum
  v_locked_statuses text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review','approved'
  ];
BEGIN
  v_user := auth.uid();

  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal') THEN
    v_policy := 'pre_review_only';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    v_kpi_id := (item->>'kpi_id')::uuid;

    SELECT status::text INTO v_current_status
    FROM kpis WHERE id = v_kpi_id;

    IF v_current_status IS NULL THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id, 'current_status', 'missing', 'reason', 'kpi_not_found'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    v_allow_overwrite := CASE v_policy
      WHEN 'safe' THEN v_current_status = 'kra_set'
      WHEN 'pre_review_only' THEN v_current_status IN ('kra_set','self_review')
      WHEN 'force_pre_terminal' THEN NOT (v_current_status = ANY(v_locked_statuses))
      ELSE false
    END;

    IF NOT v_allow_overwrite THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id,
        'current_status', v_current_status,
        'reason', CASE
          WHEN v_current_status = ANY(v_locked_statuses) THEN 'reviewer_locked'
          ELSE 'not_in_kra_set'
        END
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT self_score INTO old_score FROM review_submissions WHERE kpi_id = v_kpi_id;

    v_evidence_url := item->>'evidence_url';
    v_evidence_urls := CASE
      WHEN v_evidence_url IS NOT NULL AND v_evidence_url != ''
      THEN jsonb_build_array(v_evidence_url)
      ELSE NULL
    END;

    v_self_score := CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END;
    v_achieved_value := CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END;

    v_target_status := CASE WHEN v_current_status = 'kra_set' THEN 'self_review' ELSE v_current_status END;

    UPDATE public.kpis SET status = v_target_status::public.review_status WHERE id = v_kpi_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id, 'current_status', v_current_status, 'reason', 'race_lost_during_advance'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO review_submissions (
      kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    )
    VALUES (
      v_kpi_id, v_achieved_value, v_self_score,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_rating')::text::rating_level END,
      p_is_na,
      CASE WHEN p_is_na THEN 'admin' ELSE NULL END,
      CASE WHEN p_is_na THEN NULL ELSE v_evidence_url END,
      CASE WHEN p_is_na THEN NULL ELSE v_evidence_urls END,
      CASE WHEN p_is_na THEN NULL ELSE p_remarks END,
      now()
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value = EXCLUDED.achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      self_evidence_url = COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url),
      self_evidence_urls = COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls),
      self_remarks = COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks),
      updated_at = now();

    IF old_score IS DISTINCT FROM v_self_score THEN
      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        v_kpi_id, 'ORG_KPI_VALUE_OVERWRITTEN', v_user,
        jsonb_build_object(
          'old_self_score', old_score,
          'new_self_score', v_self_score,
          'achieved_value', v_achieved_value,
          'overwrite_policy', v_policy,
          'prior_status', v_current_status
        )
      );
    END IF;

    propagated_count := propagated_count + 1;

    result := result || jsonb_build_object(
      'kpi_id', v_kpi_id,
      'old_score', old_score,
      'new_score', v_self_score,
      'prior_status', v_current_status,
      'new_status', v_target_status
    );
  END LOOP;

  RETURN jsonb_build_object(
    'propagated', propagated_count,
    'skipped', skipped_count,
    'results', result,
    'skipped_details', skipped
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.propagate_org_kpi_value(jsonb, boolean, text, text) TO authenticated;

-- 2) Diagnostic RPC: dry-run gap report (read-only)
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
    AND normalize_kpi_text(k.kpi_name) = v_kpi_norm;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.diagnose_org_kpi_propagation_gap(uuid, text, text, text, integer) TO authenticated;

-- 3) Repair RPC: write review_submissions for every entered, eligible row
-- NOTE: scoring math (rating + score) is left to the existing client buildRatingsPayload
-- path for ordinary propagation. This repair RPC computes self_score using a simple
-- linear bucket from r5..r0 thresholds when stored as numeric-castable text. For
-- qualitative (binary/tiered) KPIs the achieved_value IS the rating.
CREATE OR REPLACE FUNCTION public.repair_org_kpi_entered_unpropagated_rows(
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
  v_locked_statuses text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review','approved'
  ];
  rec record;
  v_repaired int := 0;
  v_locked   int := 0;
  v_blank    int := 0;
  v_missing  int := 0;
  v_already  int := 0;
  v_self_score numeric;
  v_self_rating text;
  v_target_num numeric;
  v_higher_better boolean;
  v_repaired_employees jsonb := '[]'::jsonb;
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
    RAISE EXCEPTION 'Not authorized to repair this org KPI';
  END IF;

  FOR rec IN
    SELECT
      k.id AS kpi_id, k.status::text AS kpi_status, k.target_value, k.criteria,
      k.uom_type::text AS uom_type, k.r5, k.r4, k.r3, k.r2, k.r1, k.r0,
      v.id AS okv_id, v.achieved_value AS okv_achieved, v.is_na AS okv_is_na,
      v.remarks AS okv_remarks, v.evidence_url AS okv_evidence,
      v.evidence_urls AS okv_evidence_urls,
      rs.kpi_id IS NOT NULL AS has_rs,
      rs.self_score AS rs_self_score,
      p.full_name
    FROM kpis k
    LEFT JOIN profiles p ON p.id = k.employee_id
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
  LOOP
    -- Classification
    IF rec.has_rs AND rec.rs_self_score IS NOT NULL THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    IF rec.okv_id IS NULL THEN
      v_missing := v_missing + 1;
      CONTINUE;
    END IF;
    IF rec.okv_achieved IS NULL AND COALESCE(rec.okv_is_na,false) = false THEN
      v_blank := v_blank + 1;
      CONTINUE;
    END IF;
    IF rec.kpi_status = ANY(v_locked_statuses) THEN
      v_locked := v_locked + 1;
      CONTINUE;
    END IF;

    -- Compute self_score
    IF COALESCE(rec.okv_is_na,false) THEN
      v_self_score := NULL;
      v_self_rating := NULL;
    ELSIF rec.uom_type = 'binary' OR rec.uom_type = 'tiered' THEN
      v_self_score := rec.okv_achieved; -- achieved IS the rating
    ELSE
      -- Bucket against thresholds (cast text to numeric where possible).
      v_target_num := rec.target_value;
      v_higher_better := COALESCE(rec.criteria,'Higher is Better') NOT IN ('Lower is Better','Lower the Better');
      BEGIN
        IF v_higher_better THEN
          v_self_score := CASE
            WHEN rec.okv_achieved >= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved >= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved >= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved >= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved >= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0
          END;
        ELSE
          v_self_score := CASE
            WHEN rec.okv_achieved <= NULLIF(rec.r5,'')::numeric THEN 5
            WHEN rec.okv_achieved <= NULLIF(rec.r4,'')::numeric THEN 4
            WHEN rec.okv_achieved <= NULLIF(rec.r3,'')::numeric THEN 3
            WHEN rec.okv_achieved <= NULLIF(rec.r2,'')::numeric THEN 2
            WHEN rec.okv_achieved <= NULLIF(rec.r1,'')::numeric THEN 1
            ELSE 0
          END;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- If thresholds aren't numeric-castable, fall back to 0 and let admin re-score.
        v_self_score := 0;
      END;
    END IF;

    v_self_rating := CASE
      WHEN v_self_score IS NULL THEN NULL
      WHEN v_self_score >= 5 THEN 'green'
      WHEN v_self_score >= 4 THEN 'green'
      WHEN v_self_score >= 3 THEN 'yellow'
      WHEN v_self_score >= 2 THEN 'orange'
      ELSE 'red'
    END;

    -- Write scorecard
    INSERT INTO review_submissions (
      kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    )
    VALUES (
      rec.kpi_id,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_achieved END,
      v_self_score,
      CASE WHEN rec.okv_is_na THEN NULL ELSE v_self_rating::rating_level END,
      COALESCE(rec.okv_is_na,false),
      CASE WHEN rec.okv_is_na THEN 'admin' ELSE NULL END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_evidence END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_evidence_urls END,
      CASE WHEN rec.okv_is_na THEN NULL ELSE rec.okv_remarks END,
      now()
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value = EXCLUDED.achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      self_evidence_url = COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url),
      self_evidence_urls = COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls),
      self_remarks = COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks),
      updated_at = now();

    -- Advance kpis status
    UPDATE kpis SET status = 'self_review'::review_status
      WHERE id = rec.kpi_id AND status = 'kra_set';

    -- Mark org_kpi_values as propagated
    UPDATE org_kpi_values SET status = 'propagated', updated_at = now()
      WHERE id = rec.okv_id;

    -- Audit log
    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, new_value, metadata)
    VALUES (
      rec.kpi_id, 'ORG_KPI_PROPAGATED', v_user,
      jsonb_build_object(
        'achieved_value', rec.okv_achieved,
        'self_score', v_self_score,
        'self_rating', v_self_rating,
        'is_na', COALESCE(rec.okv_is_na,false),
        'source', 'repair_org_kpi_entered_unpropagated_rows'
      ),
      jsonb_build_object('repaired_from_status', rec.kpi_status)
    );

    v_repaired := v_repaired + 1;
    v_repaired_employees := v_repaired_employees || jsonb_build_object(
      'kpi_id', rec.kpi_id, 'employee_name', rec.full_name, 'self_score', v_self_score
    );
  END LOOP;

  RETURN jsonb_build_object(
    'repaired', v_repaired,
    'reviewer_locked', v_locked,
    'staging_blank', v_blank,
    'missing_staging', v_missing,
    'already_propagated', v_already,
    'repaired_employees', v_repaired_employees
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.repair_org_kpi_entered_unpropagated_rows(uuid, text, text, text, integer) TO authenticated;

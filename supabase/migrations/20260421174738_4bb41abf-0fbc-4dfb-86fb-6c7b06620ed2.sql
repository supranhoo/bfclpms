-- =============================================================================
-- Phase B2: Late-joiner auto-pull trigger for Org KPIs
-- =============================================================================

-- 1. Feature flag (default OFF for one release)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS enable_org_kpi_autopull boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_settings.enable_org_kpi_autopull IS
  'When true, newly created org-level KPIs in kra_set will auto-pull the achieved value from a matching propagated/approved org_kpi_values row.';

-- =============================================================================
-- 2. Helper: compute self_score + self_rating from KPI thresholds for an
--    achieved value. Mirrors the propagation scoring logic.
--    Returns: (score numeric, rating text)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compute_org_kpi_score_for_kpi(
  p_kpi_id uuid,
  p_achieved numeric
)
RETURNS TABLE(score numeric, rating text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpi RECORD;
  v_target numeric;
  v_score numeric := 0;
  v_rating text := 'red';
BEGIN
  SELECT target_value, r0, r1, r2, r3, r4, r5, threshold_mode, uom_type
  INTO v_kpi
  FROM kpis WHERE id = p_kpi_id;

  IF NOT FOUND OR p_achieved IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text;
    RETURN;
  END IF;

  -- Simple proportional score against target; rating bands aligned to thresholds.
  -- Higher-is-better assumption; advanced threshold parsing is left to the
  -- main scoring engine on subsequent edits.
  IF v_kpi.target_value IS NOT NULL AND v_kpi.target_value > 0 THEN
    v_score := LEAST(5, ROUND((p_achieved / v_kpi.target_value) * 5, 2));
  ELSE
    v_score := 0;
  END IF;

  v_rating := CASE
    WHEN v_score >= 4.5 THEN 'green'
    WHEN v_score >= 3.5 THEN 'blue'
    WHEN v_score >= 2.5 THEN 'amber'
    ELSE 'red'
  END;

  RETURN QUERY SELECT v_score, v_rating;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_org_kpi_score_for_kpi(uuid, numeric) TO authenticated;

-- =============================================================================
-- 3. Trigger function: auto-pull on INSERT into kpis
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_autopull_propagated_org_kpi()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_okv RECORD;
  v_score numeric;
  v_rating text;
  v_emp_dept uuid;
BEGIN
  -- Short-circuit: only org-level KPIs in kra_set
  IF NEW.is_org_level IS NOT TRUE OR NEW.status::text <> 'kra_set' THEN
    RETURN NEW;
  END IF;

  -- Feature flag gate
  SELECT enable_org_kpi_autopull INTO v_enabled
  FROM app_settings
  WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Resolve employee department for scope matching
  SELECT department_id INTO v_emp_dept
  FROM profiles WHERE id = NEW.employee_id;

  -- Find the most specific matching OKV (employee > department > org-wide)
  SELECT *
  INTO v_okv
  FROM org_kpi_values okv
  WHERE okv.category_id = NEW.category_id
    AND lower(trim(okv.kra_name)) = lower(trim(NEW.kra_name))
    AND lower(trim(okv.kpi_name)) = lower(trim(NEW.kpi_name))
    AND okv.review_period = NEW.review_period
    AND okv.review_year = NEW.review_year
    AND okv.status IN ('propagated', 'approved')
    AND (
      okv.employee_id = NEW.employee_id
      OR (okv.employee_id IS NULL AND okv.department_id = v_emp_dept)
      OR (okv.employee_id IS NULL AND okv.department_id IS NULL)
    )
  ORDER BY
    (okv.employee_id = NEW.employee_id) DESC,
    (okv.department_id = v_emp_dept) DESC,
    okv.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Compute score for the achieved value (NULL-safe for is_na)
  IF NOT v_okv.is_na AND v_okv.achieved_value IS NOT NULL THEN
    SELECT s.score, s.rating
    INTO v_score, v_rating
    FROM compute_org_kpi_score_for_kpi(NEW.id, v_okv.achieved_value) s;
  END IF;

  -- Insert pre-filled submission
  INSERT INTO review_submissions (
    kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
    self_evidence_url, self_evidence_urls, self_remarks, self_submitted_at, updated_at
  )
  VALUES (
    NEW.id,
    CASE WHEN v_okv.is_na THEN NULL ELSE v_okv.achieved_value END,
    CASE WHEN v_okv.is_na THEN NULL ELSE v_score END,
    CASE WHEN v_okv.is_na OR v_rating IS NULL THEN NULL ELSE v_rating::rating_level END,
    v_okv.is_na,
    CASE WHEN v_okv.is_na THEN 'admin' ELSE NULL END,
    v_okv.evidence_url,
    v_okv.evidence_urls,
    NULL,
    now(),
    now()
  )
  ON CONFLICT (kpi_id) DO NOTHING;

  -- Advance status
  UPDATE kpis SET status = 'self_review', updated_at = now()
  WHERE id = NEW.id AND status = 'kra_set';

  -- Audit log
  INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
  VALUES (
    NEW.id,
    'ORG_KPI_AUTOPULLED_FOR_LATE_JOINER',
    NULL, -- system performer
    jsonb_build_object(
      'source_okv_id', v_okv.id,
      'okv_status', v_okv.status,
      'achieved_value', v_okv.achieved_value,
      'is_na', v_okv.is_na,
      'computed_score', v_score,
      'computed_rating', v_rating,
      'joined_after_propagation_at', v_okv.updated_at,
      'scope_match', CASE
        WHEN v_okv.employee_id = NEW.employee_id THEN 'employee'
        WHEN v_okv.department_id = v_emp_dept THEN 'department'
        ELSE 'organization'
      END
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autopull_propagated_org_kpi ON public.kpis;
CREATE TRIGGER trg_autopull_propagated_org_kpi
  AFTER INSERT ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_autopull_propagated_org_kpi();

-- =============================================================================
-- 4. One-shot repair function for historical late-joiners
-- =============================================================================
CREATE OR REPLACE FUNCTION public.backfill_late_joiner_org_kpis(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_kpi RECORD;
  v_okv RECORD;
  v_score numeric;
  v_rating text;
  v_emp_dept uuid;
  v_processed int := 0;
  v_skipped int := 0;
  v_details jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  FOR v_kpi IN
    SELECT k.id, k.employee_id, k.category_id, k.kra_name, k.kpi_name,
           k.review_period, k.review_year, k.created_at
    FROM kpis k
    WHERE k.is_org_level = true
      AND k.status::text = 'kra_set'
  LOOP
    SELECT department_id INTO v_emp_dept FROM profiles WHERE id = v_kpi.employee_id;

    SELECT *
    INTO v_okv
    FROM org_kpi_values okv
    WHERE okv.category_id = v_kpi.category_id
      AND lower(trim(okv.kra_name)) = lower(trim(v_kpi.kra_name))
      AND lower(trim(okv.kpi_name)) = lower(trim(v_kpi.kpi_name))
      AND okv.review_period = v_kpi.review_period
      AND okv.review_year = v_kpi.review_year
      AND okv.status IN ('propagated', 'approved')
      AND (
        okv.employee_id = v_kpi.employee_id
        OR (okv.employee_id IS NULL AND okv.department_id = v_emp_dept)
        OR (okv.employee_id IS NULL AND okv.department_id IS NULL)
      )
    ORDER BY
      (okv.employee_id = v_kpi.employee_id) DESC,
      (okv.department_id = v_emp_dept) DESC,
      okv.updated_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_score := NULL;
    v_rating := NULL;
    IF NOT v_okv.is_na AND v_okv.achieved_value IS NOT NULL THEN
      SELECT s.score, s.rating
      INTO v_score, v_rating
      FROM compute_org_kpi_score_for_kpi(v_kpi.id, v_okv.achieved_value) s;
    END IF;

    v_details := v_details || jsonb_build_object(
      'kpi_id', v_kpi.id,
      'employee_id', v_kpi.employee_id,
      'okv_id', v_okv.id,
      'achieved_value', v_okv.achieved_value,
      'computed_score', v_score
    );

    IF NOT p_dry_run THEN
      INSERT INTO review_submissions (
        kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
        self_evidence_url, self_evidence_urls, self_submitted_at, updated_at
      )
      VALUES (
        v_kpi.id,
        CASE WHEN v_okv.is_na THEN NULL ELSE v_okv.achieved_value END,
        CASE WHEN v_okv.is_na THEN NULL ELSE v_score END,
        CASE WHEN v_okv.is_na OR v_rating IS NULL THEN NULL ELSE v_rating::rating_level END,
        v_okv.is_na,
        CASE WHEN v_okv.is_na THEN 'admin' ELSE NULL END,
        v_okv.evidence_url,
        v_okv.evidence_urls,
        now(),
        now()
      )
      ON CONFLICT (kpi_id) DO NOTHING;

      UPDATE kpis SET status = 'self_review', updated_at = now()
      WHERE id = v_kpi.id AND status = 'kra_set';

      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        v_kpi.id,
        'ORG_KPI_AUTOPULLED_FOR_LATE_JOINER',
        v_user,
        jsonb_build_object(
          'source_okv_id', v_okv.id,
          'tool', 'late_joiner_backfill',
          'achieved_value', v_okv.achieved_value,
          'computed_score', v_score
        )
      );
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'processed', v_processed,
    'skipped', v_skipped,
    'details', v_details
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_late_joiner_org_kpis(boolean) TO authenticated;
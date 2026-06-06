CREATE OR REPLACE FUNCTION public.trg_autopull_propagated_org_kpi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_enabled boolean;
  v_okv RECORD;
  v_score numeric;
  v_rating text;
  v_emp_dept uuid;
BEGIN
  IF NEW.is_org_level IS NOT TRUE OR NEW.status::text <> 'kra_set' THEN
    RETURN NEW;
  END IF;

  SELECT enable_org_kpi_autopull INTO v_enabled
  FROM app_settings
  WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT department_id INTO v_emp_dept
  FROM profiles WHERE id = NEW.employee_id;

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

  IF NOT v_okv.is_na AND v_okv.achieved_value IS NOT NULL THEN
    SELECT s.score, s.rating
    INTO v_score, v_rating
    FROM compute_org_kpi_score_for_kpi(NEW.id, v_okv.achieved_value) s;
  END IF;

  INSERT INTO review_submissions (
    kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
    self_evidence_url, self_evidence_urls, self_remarks, submitted_at, updated_at
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

  UPDATE kpis SET status = 'self_review', updated_at = now()
  WHERE id = NEW.id AND status = 'kra_set';

  INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
  VALUES (
    NEW.id,
    'ORG_KPI_AUTOPULLED_FOR_LATE_JOINER',
    NULL,
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
$function$;
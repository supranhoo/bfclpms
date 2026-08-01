CREATE OR REPLACE FUNCTION public.rollback_org_kpi_propagation_by_children(
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_kpi_ids uuid[];
  v_target_ids uuid[];
  v_skipped_ids uuid[];
  v_manager_stage_cleared integer := 0;
  v_scorecards_cleared integer := 0;
  v_skipped_approved integer := 0;
  v_scopes_reset integer := 0;
  v_cat_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required';
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::app_role);
  SELECT EXISTS (
    SELECT 1 FROM public.org_kpi_data_owners o
    WHERE o.owner_id = v_user
      AND o.kra_name = p_kra_name
      AND o.kpi_name = p_kpi_name
  ) INTO v_is_owner;

  IF NOT (v_is_admin OR v_is_owner) THEN
    RAISE EXCEPTION 'Not authorized to roll back this org KPI';
  END IF;

  -- Work list is derived from CHILD truth (kpis), independent of master status.
  SELECT array_agg(k.id) INTO v_kpi_ids
  FROM public.kpis k
  WHERE k.is_org_level = true
    AND k.kra_name = p_kra_name
    AND k.kpi_name = p_kpi_name
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year;

  v_kpi_ids := COALESCE(v_kpi_ids, ARRAY[]::uuid[]);

  -- Approved (and beyond) cells are frozen — never touched.
  SELECT array_agg(k.id) INTO v_skipped_ids
  FROM public.kpis k
  WHERE k.id = ANY(v_kpi_ids)
    AND k.status IN ('approved'::review_status, 'management_review'::review_status);

  v_skipped_ids := COALESCE(v_skipped_ids, ARRAY[]::uuid[]);

  SELECT array_agg(k.id) INTO v_target_ids
  FROM public.kpis k
  WHERE k.id = ANY(v_kpi_ids)
    AND NOT (k.id = ANY(v_skipped_ids));

  v_target_ids := COALESCE(v_target_ids, ARRAY[]::uuid[]);
  v_skipped_approved := array_length(v_skipped_ids, 1);
  v_skipped_approved := COALESCE(v_skipped_approved, 0);

  SELECT count(*) INTO v_manager_stage_cleared
  FROM public.kpis k
  WHERE k.id = ANY(v_target_ids)
    AND k.status <> 'kra_set'::review_status
    AND k.status <> 'self_review'::review_status;

  IF array_length(v_target_ids, 1) > 0 THEN
    UPDATE public.review_submissions rs
    SET achieved_value = NULL,
        self_score = NULL,
        self_rating = NULL,
        self_achieved_value = NULL,
        manager_score = NULL,
        manager_rating = NULL,
        manager_achieved_value = NULL,
        manager_remarks = NULL,
        functional_manager_score = NULL,
        functional_manager_rating = NULL,
        functional_manager_achieved_value = NULL,
        functional_manager_remarks = NULL,
        skip_level_score = NULL,
        skip_level_rating = NULL,
        skip_level_achieved_value = NULL,
        skip_level_remarks = NULL,
        auditor_score = NULL,
        auditor_rating = NULL,
        auditor_achieved_value = NULL,
        auditor_remarks = NULL,
        hr_pms_score = NULL,
        hr_pms_rating = NULL,
        hr_pms_achieved_value = NULL,
        hr_pms_remarks = NULL,
        updated_at = now()
    WHERE rs.kpi_id = ANY(v_target_ids);

    GET DIAGNOSTICS v_scorecards_cleared = ROW_COUNT;

    UPDATE public.kpis k
    SET status = 'kra_set'::review_status,
        updated_at = now()
    WHERE k.id = ANY(v_target_ids)
      AND k.status <> 'kra_set'::review_status;
  END IF;

  -- Reset master rows for the same KRA/KPI/period.
  WITH reset AS (
    UPDATE public.org_kpi_values v
    SET status = 'pending',
        achieved_value = NULL,
        remarks = NULL,
        evidence_url = NULL,
        updated_at = now()
    WHERE v.kra_name = p_kra_name
      AND v.kpi_name = p_kpi_name
      AND v.review_period = p_review_period
      AND v.review_year = p_review_year
    RETURNING v.category_id, v.achieved_value
  )
  SELECT count(*) INTO v_scopes_reset FROM reset;

  SELECT k.category_id INTO v_cat_id
  FROM public.kpis k
  WHERE k.id = ANY(v_kpi_ids)
  LIMIT 1;

  IF v_cat_id IS NOT NULL THEN
    INSERT INTO public.org_kpi_data_entry_logs
      (category_id, kra_name, kpi_name, review_period, review_year,
       action, performed_by, old_value, new_value, remarks)
    VALUES
      (v_cat_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
       'bulk_rollback_children', v_user, NULL, NULL,
       format('%s | scopes_reset=%s scorecards_cleared=%s manager_stage_cleared=%s skipped_approved=%s',
              btrim(p_reason), v_scopes_reset, v_scorecards_cleared,
              v_manager_stage_cleared, v_skipped_approved));
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT DISTINCT o.owner_id,
         'Org KPI rolled back',
         format('"%s" for %s %s has been rolled back to data entry. Reason: %s',
                p_kpi_name, p_review_period, p_review_year, btrim(p_reason)),
         'org_kpi_rollback'
  FROM public.org_kpi_data_owners o
  WHERE o.kra_name = p_kra_name
    AND o.kpi_name = p_kpi_name
    AND o.owner_id <> v_user;

  RETURN jsonb_build_object(
    'scopes_reset', v_scopes_reset,
    'scorecards_cleared', v_scorecards_cleared,
    'manager_stage_cleared', v_manager_stage_cleared,
    'skipped_approved', v_skipped_approved,
    'total_children', COALESCE(array_length(v_kpi_ids, 1), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rollback_org_kpi_propagation_by_children(text, text, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.org_kpi_master_child_drift(
  p_review_period text,
  p_review_year integer
)
RETURNS TABLE (
  kra_name text,
  kpi_name text,
  master_rows integer,
  master_propagated integer,
  children_total integer,
  children_past_kra_set integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH children AS (
    SELECT k.kra_name, k.kpi_name,
           count(*)::int AS children_total,
           count(*) FILTER (WHERE k.status <> 'kra_set'::review_status)::int AS children_past
    FROM public.kpis k
    WHERE k.is_org_level = true
      AND k.review_period = p_review_period
      AND k.review_year = p_review_year
    GROUP BY 1, 2
  ), master AS (
    SELECT v.kra_name, v.kpi_name,
           count(*)::int AS master_rows,
           count(*) FILTER (WHERE v.status IN ('propagated', 'approved'))::int AS master_propagated
    FROM public.org_kpi_values v
    WHERE v.review_period = p_review_period
      AND v.review_year = p_review_year
    GROUP BY 1, 2
  )
  SELECT COALESCE(c.kra_name, m.kra_name),
         COALESCE(c.kpi_name, m.kpi_name),
         COALESCE(m.master_rows, 0),
         COALESCE(m.master_propagated, 0),
         COALESCE(c.children_total, 0),
         COALESCE(c.children_past, 0)
  FROM children c
  FULL OUTER JOIN master m
    ON m.kra_name = c.kra_name AND m.kpi_name = c.kpi_name
  WHERE (COALESCE(m.master_propagated, 0) = 0) <> (COALESCE(c.children_past, 0) = 0);
$$;

GRANT EXECUTE ON FUNCTION public.org_kpi_master_child_drift(text, integer) TO authenticated;
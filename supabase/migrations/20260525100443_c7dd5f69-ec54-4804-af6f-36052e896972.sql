CREATE OR REPLACE FUNCTION public.kpi_cell_detail(p_kpi_id uuid, p_emp_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kpi            JSONB;
  v_sub            JSONB;
  v_revisions      JSONB;
  v_employee       JSONB;
  v_kpi_history    JSONB;
  v_queries        JSONB;
  v_workflow       JSONB;
  v_org_kpi        JSONB;
  v_kra_name       TEXT;
  v_kpi_name       TEXT;
  v_review_period  TEXT;
  v_review_year    INTEGER;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'manager'::app_role)
    OR public.has_role(auth.uid(),'skip_level'::app_role)
    OR public.has_role(auth.uid(),'hr_pms'::app_role)
    OR public.has_role(auth.uid(),'auditor'::app_role)
    OR public.has_role(auth.uid(),'management'::app_role)
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(k.*)
         || jsonb_build_object(
              'kra_categories',
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color)
              END
            ),
         k.kra_name, k.kpi_name, k.review_period, k.review_year
    INTO v_kpi, v_kra_name, v_kpi_name, v_review_period, v_review_year
  FROM public.kpis k
  LEFT JOIN public.kra_categories c ON c.id = k.category_id
  WHERE k.id = p_kpi_id AND k.employee_id = p_emp_id;

  SELECT to_jsonb(rs.*) INTO v_sub
  FROM public.review_submissions rs
  WHERE rs.kpi_id = p_kpi_id
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(r.*) ORDER BY r.revision_no DESC), '[]'::jsonb)
    INTO v_revisions
  FROM public.final_score_revisions r
  JOIN public.review_submissions rs ON rs.id = r.submission_id
  WHERE rs.kpi_id = p_kpi_id;

  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'employee_code', p.employee_code,
    'designation', p.designation,
    'department_id', p.department_id,
    'reporting_manager_id', p.reporting_manager_id,
    'reporting_manager_name', mgr.full_name
  ) INTO v_employee
  FROM public.profiles p
  LEFT JOIN public.profiles mgr ON mgr.id = p.reporting_manager_id
  WHERE p.id = p_emp_id;

  WITH hist AS (
    SELECT k.*
    FROM public.kpis k
    WHERE k.employee_id = p_emp_id
      AND k.kra_name = v_kra_name
      AND k.kpi_name = v_kpi_name
    ORDER BY k.review_year DESC,
             CASE k.review_period
               WHEN 'December' THEN 12 WHEN 'November' THEN 11 WHEN 'October' THEN 10
               WHEN 'September' THEN 9 WHEN 'August' THEN 8 WHEN 'July' THEN 7
               WHEN 'June' THEN 6 WHEN 'May' THEN 5 WHEN 'April' THEN 4
               WHEN 'March' THEN 3 WHEN 'February' THEN 2 WHEN 'January' THEN 1
               ELSE 0
             END DESC
    LIMIT 6
  )
  SELECT jsonb_build_object(
    'kpis', COALESCE(jsonb_agg(to_jsonb(h.*)), '[]'::jsonb),
    'submissions', COALESCE((
      SELECT jsonb_agg(to_jsonb(rs2.*))
      FROM public.review_submissions rs2
      WHERE rs2.kpi_id IN (SELECT id FROM hist)
    ), '[]'::jsonb)
  ) INTO v_kpi_history
  FROM hist h;

  SELECT COALESCE(jsonb_agg(to_jsonb(q.*) ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_queries
  FROM public.kpi_queries q
  WHERE q.kpi_id = p_kpi_id;

  BEGIN
    SELECT public.get_employee_workflow(p_emp_id, v_review_period, v_review_year)
      INTO v_workflow;
  EXCEPTION WHEN OTHERS THEN
    v_workflow := NULL;
  END;

  SELECT to_jsonb(o.*) INTO v_org_kpi
  FROM public.org_kpi_values o
  WHERE o.kra_name = v_kra_name
    AND o.kpi_name = v_kpi_name
    AND o.review_period = v_review_period
    AND o.review_year = v_review_year
  LIMIT 1;

  RETURN jsonb_build_object(
    'kpi', v_kpi,
    'submission', v_sub,
    'revisions', v_revisions,
    'employee', v_employee,
    'kpi_history', v_kpi_history,
    'queries', v_queries,
    'workflow', COALESCE(v_workflow, 'null'::jsonb),
    'org_kpi', v_org_kpi
  );
END;
$function$;
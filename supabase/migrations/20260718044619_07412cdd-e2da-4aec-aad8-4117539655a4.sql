
CREATE OR REPLACE FUNCTION public.get_annual_review_comprehensive_report(p_cycle_id uuid)
RETURNS TABLE (
  instance_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  designation text,
  department_id uuid,
  department_name text,
  business_unit_id uuid,
  business_unit_name text,
  division_id uuid,
  division_name text,
  grade text,
  doj date,
  overall_status annual_review_status,
  is_excluded boolean,
  excluded_reason text,
  enabled_stages jsonb,
  self_score numeric,
  manager_score numeric,
  dept_head_score numeric,
  bu_head_score numeric,
  hr_score numeric,
  total_score numeric,
  final_rating text,
  finalized_at timestamptz,
  updated_at timestamptz,
  days_pending integer,
  manager_name text,
  dept_head_name text,
  bu_head_name text,
  hr_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_access jsonb;
  v_scope text;
  v_bu_ids uuid[];
  v_subtree uuid[];
BEGIN
  IF v_uid IS NULL OR p_cycle_id IS NULL THEN
    RETURN;
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RETURN;
  END IF;
  v_scope := v_access->>'scope';

  IF v_scope = 'bu' THEN
    SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_bu_ids
    FROM jsonb_array_elements_text(COALESCE(v_access->'business_unit_ids','[]'::jsonb)) x;
  ELSIF v_scope = 'team' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_subtree
    FROM public.annual_review_subtree_ids(v_uid, 20) id;
  END IF;

  RETURN QUERY
  WITH stage_scores AS (
    SELECT
      r.instance_id,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'self')       AS self_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'manager')    AS mgr_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'dept_head')  AS dh_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'bu_head')    AS bu_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'hr')         AS hr_s
    FROM public.annual_review_responses r
    JOIN public.annual_review_instances i2 ON i2.id = r.instance_id
    WHERE i2.cycle_id = p_cycle_id
    GROUP BY r.instance_id
  )
  SELECT
    i.id,
    i.employee_id,
    p.employee_code,
    p.full_name,
    p.designation,
    p.department_id,
    d.name,
    d.business_unit_id,
    bu.name,
    bu.division_id,
    div.name,
    p.pms_grade,
    p.doj,
    i.overall_status,
    (i.overall_status = 'excluded'),
    i.excluded_reason,
    i.enabled_stages,
    ss.self_s,
    ss.mgr_s,
    ss.dh_s,
    ss.bu_s,
    ss.hr_s,
    i.total_score,
    i.final_rating,
    i.finalized_at,
    i.updated_at,
    GREATEST(0, EXTRACT(DAY FROM (now() - i.updated_at))::int),
    pm.full_name,
    pdh.full_name,
    pbu.full_name,
    phr.full_name
  FROM public.annual_review_instances i
  JOIN public.profiles p         ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN public.divisions div ON div.id = bu.division_id
  LEFT JOIN public.profiles pm   ON pm.id = i.manager_id
  LEFT JOIN public.profiles pdh  ON pdh.id = i.dept_head_id
  LEFT JOIN public.profiles pbu  ON pbu.id = i.bu_head_id
  LEFT JOIN public.profiles phr  ON phr.id = i.hr_id
  LEFT JOIN stage_scores ss      ON ss.instance_id = i.id
  WHERE i.cycle_id = p_cycle_id
    AND (
      v_scope = 'all'
      OR (v_scope = 'bu' AND d.business_unit_id = ANY(v_bu_ids))
      OR (v_scope = 'team' AND i.employee_id = ANY(v_subtree))
    )
  ORDER BY COALESCE(d.name,''), COALESCE(bu.name,''), COALESCE(p.full_name,'');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_annual_review_comprehensive_report(uuid) TO authenticated;

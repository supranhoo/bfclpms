CREATE OR REPLACE FUNCTION public.ar_recommendation_queue(
  p_cycle_id uuid,
  p_status text DEFAULT NULL::text,
  p_type_key text DEFAULT NULL::text,
  p_monetary_only boolean DEFAULT false,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_source text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, instance_id uuid, employee_id uuid, employee_code text, employee_name text,
  department_name text, business_unit_name text, designation_name text,
  reviewer_role annual_reviewer_role, reviewer_name text, type_keys text[], type_labels text[],
  is_monetary boolean, amount_kind text, amount_value numeric, approved_amount_kind text,
  approved_amount_value numeric, proposed_designation text, proposed_grade text,
  effective_from date, narrative text, status text, source text, decided_at timestamptz,
  decision_reason text, final_rating text, total_score numeric, created_at timestamptz,
  total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Not authorised to view the recommendation queue';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT r.*,
           i.total_score AS i_total_score,
           i.final_rating AS i_final_rating,
           p.employee_code AS emp_code,
           p.full_name AS emp_name,
           d.name AS dept_name,
           bu.name AS bu_name,
           p.designation::text AS desig_name,
           rp.full_name AS rev_name,
           pd.name AS prop_desig,
           pgd.name AS prop_grade,
           ARRAY(SELECT t.key FROM public.annual_review_recommendation_items it
                   JOIN public.annual_review_recommendation_types t ON t.id = it.type_id
                  WHERE it.recommendation_id = r.id ORDER BY t.sort_order) AS t_keys,
           ARRAY(SELECT t.label FROM public.annual_review_recommendation_items it
                   JOIN public.annual_review_recommendation_types t ON t.id = it.type_id
                  WHERE it.recommendation_id = r.id ORDER BY t.sort_order) AS t_labels,
           EXISTS (SELECT 1 FROM public.annual_review_recommendation_items it
                     JOIN public.annual_review_recommendation_types t ON t.id = it.type_id
                    WHERE it.recommendation_id = r.id AND t.is_monetary) AS monetary
      FROM public.annual_review_recommendations r
      JOIN public.annual_review_instances i ON i.id = r.instance_id
      LEFT JOIN public.profiles p ON p.id = r.employee_id
      LEFT JOIN public.departments d ON d.id = p.department_id
      LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
      LEFT JOIN public.profiles rp ON rp.id = r.reviewer_id
      LEFT JOIN public.designations pd ON pd.id = r.proposed_designation_id
      LEFT JOIN public.pms_grades pgd ON pgd.id = r.proposed_grade_id
     WHERE r.cycle_id = p_cycle_id
  ), filtered AS (
    SELECT * FROM base b
     WHERE (p_status IS NULL OR b.status = p_status)
       AND (p_source IS NULL OR b.source = p_source)
       AND (p_type_key IS NULL OR p_type_key = ANY(b.t_keys))
       AND (NOT p_monetary_only OR b.monetary)
       AND (
         COALESCE(btrim(p_search), '') = ''
         OR b.emp_name ILIKE '%' || p_search || '%'
         OR b.emp_code ILIKE '%' || p_search || '%'
         OR b.narrative ILIKE '%' || p_search || '%'
       )
  )
  SELECT f.id, f.instance_id, f.employee_id, f.emp_code, f.emp_name, f.dept_name, f.bu_name,
         f.desig_name, f.reviewer_role, f.rev_name, f.t_keys, f.t_labels, f.monetary,
         f.amount_kind, f.amount_value, f.approved_amount_kind, f.approved_amount_value,
         f.prop_desig, f.prop_grade, f.effective_from, f.narrative, f.status, f.source,
         f.decided_at, f.decision_reason, f.i_final_rating, f.i_total_score, f.created_at,
         (SELECT count(*) FROM filtered) AS total_count
    FROM filtered f
   ORDER BY f.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) TO service_role;
-- ADR-226 Phase 1b — recommendation RPCs

CREATE OR REPLACE FUNCTION public.ar_save_recommendation(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role,
  p_type_keys text[] DEFAULT '{}',
  p_amount_kind text DEFAULT NULL,
  p_amount_value numeric DEFAULT NULL,
  p_designation_id uuid DEFAULT NULL,
  p_grade_id uuid DEFAULT NULL,
  p_effective_from date DEFAULT NULL,
  p_narrative text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inst public.annual_review_instances%ROWTYPE;
  v_slot uuid;
  v_is_decider boolean := public.ar_can_decide_recommendation();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review instance not found'; END IF;

  v_slot := CASE p_reviewer_role
    WHEN 'manager'    THEN v_inst.manager_id
    WHEN 'skip_manager' THEN v_inst.skip_id
    WHEN 'dept_head'  THEN v_inst.dept_head_id
    WHEN 'bu_head'    THEN v_inst.bu_head_id
    WHEN 'hr'         THEN v_inst.hr_id
    WHEN 'management' THEN v_inst.management_id
    ELSE NULL
  END;

  IF NOT v_is_decider AND (v_slot IS NULL OR v_slot <> v_uid) THEN
    RAISE EXCEPTION 'You are not the % reviewer for this review', p_reviewer_role;
  END IF;

  IF NOT v_is_decider AND v_inst.overall_status = 'completed' THEN
    RAISE EXCEPTION 'This review is completed; recommendations can no longer be edited';
  END IF;

  INSERT INTO public.annual_review_recommendations AS r (
    instance_id, cycle_id, employee_id, reviewer_id, reviewer_role,
    amount_kind, amount_value, proposed_designation_id, proposed_grade_id,
    effective_from, narrative, source, status
  ) VALUES (
    p_instance_id, v_inst.cycle_id, v_inst.employee_id, COALESCE(v_slot, v_uid), p_reviewer_role,
    p_amount_kind, p_amount_value, p_designation_id, p_grade_id,
    p_effective_from, p_narrative, 'stage_form', 'submitted'
  )
  ON CONFLICT (instance_id, reviewer_role) DO UPDATE SET
    amount_kind = EXCLUDED.amount_kind,
    amount_value = EXCLUDED.amount_value,
    proposed_designation_id = EXCLUDED.proposed_designation_id,
    proposed_grade_id = EXCLUDED.proposed_grade_id,
    effective_from = EXCLUDED.effective_from,
    narrative = EXCLUDED.narrative,
    reviewer_id = COALESCE(r.reviewer_id, EXCLUDED.reviewer_id),
    status = CASE WHEN r.status IN ('draft','needs_classification') THEN 'submitted' ELSE r.status END,
    updated_at = now()
  RETURNING r.id INTO v_id;

  DELETE FROM public.annual_review_recommendation_items WHERE recommendation_id = v_id;

  INSERT INTO public.annual_review_recommendation_items (recommendation_id, type_id)
  SELECT v_id, t.id
    FROM public.annual_review_recommendation_types t
   WHERE t.key = ANY(COALESCE(p_type_keys, '{}'))
  ON CONFLICT DO NOTHING;

  INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, after, reason)
  VALUES (v_uid, v_inst.employee_id, 'recommendation.saved',
          jsonb_build_object('recommendation_id', v_id, 'role', p_reviewer_role,
                             'types', to_jsonb(COALESCE(p_type_keys,'{}')),
                             'amount_kind', p_amount_kind, 'amount_value', p_amount_value),
          NULL);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ar_decide_recommendation(
  p_recommendation_id uuid,
  p_status text,
  p_reason text,
  p_approved_amount_kind text DEFAULT NULL,
  p_approved_amount_value numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_emp uuid;
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Only HR, Management or Admin may decide recommendations';
  END IF;
  IF p_status NOT IN ('approved','approved_modified','rejected','deferred','implemented','submitted') THEN
    RAISE EXCEPTION 'Invalid decision status: %', p_status;
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for every recommendation decision';
  END IF;

  SELECT to_jsonb(r), r.employee_id INTO v_before, v_emp
    FROM public.annual_review_recommendations r WHERE r.id = p_recommendation_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Recommendation not found'; END IF;

  UPDATE public.annual_review_recommendations
     SET status = p_status,
         approved_amount_kind = p_approved_amount_kind,
         approved_amount_value = p_approved_amount_value,
         decided_by = v_uid,
         decided_at = now(),
         decision_reason = p_reason,
         updated_at = now()
   WHERE id = p_recommendation_id;

  INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, before, after, reason)
  VALUES (v_uid, v_emp, 'recommendation.decided', v_before,
          jsonb_build_object('recommendation_id', p_recommendation_id, 'status', p_status,
                             'approved_amount_kind', p_approved_amount_kind,
                             'approved_amount_value', p_approved_amount_value),
          p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.ar_bulk_decide_recommendations(
  p_recommendation_ids uuid[],
  p_status text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF NOT public.ar_can_decide_recommendation() THEN
    RAISE EXCEPTION 'Only HR, Management or Admin may decide recommendations';
  END IF;
  IF p_status NOT IN ('approved','rejected','deferred','implemented','submitted') THEN
    RAISE EXCEPTION 'Invalid decision status: %', p_status;
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for every recommendation decision';
  END IF;

  UPDATE public.annual_review_recommendations
     SET status = p_status, decided_by = v_uid, decided_at = now(),
         decision_reason = p_reason, updated_at = now()
   WHERE id = ANY(COALESCE(p_recommendation_ids, '{}'));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.annual_review_access_audit (actor_id, target_user_id, action, after, reason)
  VALUES (v_uid, NULL, 'recommendation.bulk_decided',
          jsonb_build_object('ids', to_jsonb(COALESCE(p_recommendation_ids,'{}')),
                             'status', p_status, 'count', v_count),
          p_reason);

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ar_recommendation_queue(
  p_cycle_id uuid,
  p_status text DEFAULT NULL,
  p_type_key text DEFAULT NULL,
  p_monetary_only boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  instance_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  department_name text,
  business_unit_name text,
  designation_name text,
  reviewer_role public.annual_reviewer_role,
  reviewer_name text,
  type_keys text[],
  type_labels text[],
  is_monetary boolean,
  amount_kind text,
  amount_value numeric,
  approved_amount_kind text,
  approved_amount_value numeric,
  proposed_designation text,
  proposed_grade text,
  effective_from date,
  narrative text,
  status text,
  decided_at timestamptz,
  decision_reason text,
  final_rating text,
  total_score numeric,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           dg.name AS desig_name,
           rp.full_name AS rev_name,
           pd.name AS prop_desig,
           pg.name AS prop_grade,
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
      LEFT JOIN public.designations dg ON dg.id = p.designation_id
      LEFT JOIN public.profiles rp ON rp.id = r.reviewer_id
      LEFT JOIN public.designations pd ON pd.id = r.proposed_designation_id
      LEFT JOIN public.pms_grades pg ON pg.id = r.proposed_grade_id
     WHERE r.cycle_id = p_cycle_id
  ), filtered AS (
    SELECT * FROM base b
     WHERE (p_status IS NULL OR b.status = p_status)
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
         f.prop_desig, f.prop_grade, f.effective_from, f.narrative, f.status,
         f.decided_at, f.decision_reason, f.i_final_rating, f.i_total_score, f.created_at,
         (SELECT count(*) FROM filtered) AS total_count
    FROM filtered f
   ORDER BY f.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
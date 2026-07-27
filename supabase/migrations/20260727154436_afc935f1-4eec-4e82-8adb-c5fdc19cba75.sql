DROP FUNCTION IF EXISTS public.get_annual_review_comprehensive_report(uuid);

CREATE OR REPLACE FUNCTION public.get_annual_review_comprehensive_report(p_cycle_id uuid)
 RETURNS TABLE(instance_id uuid, employee_id uuid, employee_code text, employee_name text, designation text, department_id uuid, department_name text, business_unit_id uuid, business_unit_name text, division_id uuid, division_name text, grade text, doj date, overall_status annual_review_status, is_excluded boolean, excluded_reason text, enabled_stages jsonb, self_score numeric, manager_score numeric, dept_head_score numeric, bu_head_score numeric, hr_score numeric, management_score numeric, total_score numeric, final_rating text, finalized_at timestamp with time zone, updated_at timestamp with time zone, days_pending integer, manager_name text, dept_head_name text, bu_head_name text, hr_name text, management_name text, self_comment text, manager_comment text, dept_head_comment text, bu_head_comment text, hr_comment text, management_comment text, hr_stage_enabled boolean, hr_response_exists boolean, hr_response_submitted_at timestamp with time zone, manager_id uuid, dept_head_id uuid, bu_head_id uuid, hr_id uuid, management_id uuid, cycle_default_stages jsonb, template_id uuid, template_name text, scoring_mode text, criteria_weight numeric, system_weight numeric, kra_weight numeric, kra_points numeric, system_scores jsonb, terminal_criteria_scores jsonb, self_rating_5 numeric, manager_rating_5 numeric, dept_head_rating_5 numeric, bu_head_rating_5 numeric, hr_rating_5 numeric, management_rating_5 numeric, rating_source text, eligibility_inputs jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_access jsonb;
  v_scope text;
  v_bu_ids uuid[];
  v_subtree uuid[];
  v_cycle_stages jsonb;
BEGIN
  IF v_uid IS NULL OR p_cycle_id IS NULL THEN RETURN; END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN RETURN; END IF;
  v_scope := v_access->>'scope';

  IF v_scope = 'bu' THEN
    SELECT COALESCE(array_agg((x)::uuid), ARRAY[]::uuid[]) INTO v_bu_ids
    FROM jsonb_array_elements_text(COALESCE(v_access->'business_unit_ids','[]'::jsonb)) x;
  ELSIF v_scope = 'team' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_subtree
    FROM public.annual_review_subtree_ids(v_uid, 20) id;
  END IF;

  SELECT c.default_enabled_stages INTO v_cycle_stages
  FROM public.annual_review_cycles c WHERE c.id = p_cycle_id;

  RETURN QUERY
  WITH stage_data AS (
    SELECT
      r.instance_id,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'self')       AS self_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'manager')    AS mgr_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'dept_head')  AS dh_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'bu_head')    AS bu_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'hr')         AS hr_s,
      MAX(r.weighted_score) FILTER (WHERE r.reviewer_role = 'management') AS mg_s,
      MAX(r.notes) FILTER (WHERE r.reviewer_role = 'self')                AS self_c,
      MAX(r.notes) FILTER (WHERE r.reviewer_role = 'manager')             AS mgr_c,
      MAX(r.notes) FILTER (WHERE r.reviewer_role = 'dept_head')           AS dh_c,
      MAX(r.notes) FILTER (WHERE r.reviewer_role = 'bu_head')             AS bu_c,
      MAX(r.notes) FILTER (WHERE r.reviewer_role = 'hr')                  AS hr_c,
      MAX(r.notes) FILTER (WHERE r.reviewer_role = 'management')          AS mg_c,
      bool_or(r.reviewer_role = 'hr')                                     AS hr_exists,
      MAX(r.submitted_at) FILTER (WHERE r.reviewer_role = 'hr')           AS hr_sub_at,
      bool_or(r.reviewer_role = 'self'       AND r.submitted_at IS NOT NULL) AS self_sub,
      bool_or(r.reviewer_role = 'manager'    AND r.submitted_at IS NOT NULL) AS mgr_sub,
      bool_or(r.reviewer_role = 'dept_head'  AND r.submitted_at IS NOT NULL) AS dh_sub,
      bool_or(r.reviewer_role = 'bu_head'    AND r.submitted_at IS NOT NULL) AS bu_sub,
      bool_or(r.reviewer_role = 'hr'         AND r.submitted_at IS NOT NULL) AS hr_sub,
      bool_or(r.reviewer_role = 'management' AND r.submitted_at IS NOT NULL) AS mg_sub,
      bool_or(r.reviewer_role = 'self'       AND COALESCE(jsonb_typeof(r.criteria_scores),'null') = 'object' AND r.criteria_scores <> '{}'::jsonb) AS self_scored,
      bool_or(r.reviewer_role = 'manager'    AND COALESCE(jsonb_typeof(r.criteria_scores),'null') = 'object' AND r.criteria_scores <> '{}'::jsonb) AS mgr_scored,
      bool_or(r.reviewer_role = 'dept_head'  AND COALESCE(jsonb_typeof(r.criteria_scores),'null') = 'object' AND r.criteria_scores <> '{}'::jsonb) AS dh_scored,
      bool_or(r.reviewer_role = 'bu_head'    AND COALESCE(jsonb_typeof(r.criteria_scores),'null') = 'object' AND r.criteria_scores <> '{}'::jsonb) AS bu_scored,
      bool_or(r.reviewer_role = 'hr'         AND COALESCE(jsonb_typeof(r.criteria_scores),'null') = 'object' AND r.criteria_scores <> '{}'::jsonb) AS hr_scored,
      bool_or(r.reviewer_role = 'management' AND COALESCE(jsonb_typeof(r.criteria_scores),'null') = 'object' AND r.criteria_scores <> '{}'::jsonb) AS mg_scored,
      COALESCE(
        MAX(r.criteria_scores::text) FILTER (WHERE r.reviewer_role = 'hr'),
        MAX(r.criteria_scores::text) FILTER (WHERE r.reviewer_role = 'management'),
        MAX(r.criteria_scores::text) FILTER (WHERE r.reviewer_role = 'bu_head'),
        MAX(r.criteria_scores::text) FILTER (WHERE r.reviewer_role = 'dept_head'),
        MAX(r.criteria_scores::text) FILTER (WHERE r.reviewer_role = 'manager'),
        MAX(r.criteria_scores::text) FILTER (WHERE r.reviewer_role = 'self')
      )::jsonb                                                            AS term_crit
    FROM public.annual_review_responses r
    JOIN public.annual_review_instances i2 ON i2.id = r.instance_id
    WHERE i2.cycle_id = p_cycle_id
    GROUP BY r.instance_id
  )
  SELECT
    i.id, i.employee_id, p.employee_code, p.full_name, p.designation,
    p.department_id, d.name, d.business_unit_id, bu.name, bu.division_id, div.name,
    p.pms_grade, p.doj, i.overall_status,
    (i.overall_status = 'excluded'), i.excluded_reason, i.enabled_stages,
    ss.self_s, ss.mgr_s, ss.dh_s, ss.bu_s, ss.hr_s, ss.mg_s,
    i.total_score, i.final_rating, i.finalized_at, i.updated_at,
    GREATEST(0, EXTRACT(DAY FROM (now() - i.updated_at))::int),
    pm.full_name, pdh.full_name, pbu.full_name, phr.full_name, pmg.full_name,
    ss.self_c, ss.mgr_c, ss.dh_c, ss.bu_c, ss.hr_c, ss.mg_c,
    COALESCE((i.enabled_stages ? 'hr'), (v_cycle_stages ? 'hr'), false),
    COALESCE(ss.hr_exists, false), ss.hr_sub_at,
    i.manager_id, i.dept_head_id, i.bu_head_id, i.hr_id, i.management_id,
    v_cycle_stages,
    t.id, t.name,
    CASE
      WHEN COALESCE(tw.kra_weight, 0) > 0 AND COALESCE(tw.criteria_weight, 0) > 0 THEN 'Blended'
      WHEN COALESCE(tw.kra_weight, 0) > 0 THEN 'With KRA'
      ELSE 'Without KRA'
    END,
    COALESCE(tw.criteria_weight, 0),
    COALESCE(tw.system_weight, 0),
    COALESCE(tw.kra_weight, 0),
    kp.kra_points,
    COALESCE(i.system_scores, '{}'::jsonb),
    COALESCE(ss.term_crit, '{}'::jsonb),
    CASE WHEN COALESCE(ss.self_scored,false) AND COALESCE(rw.self_w,0) > 0
           THEN ROUND(ss.self_s / rw.self_w, 2)
         WHEN COALESCE(ss.self_sub,false) THEN kp.kra_rating_5 END,
    CASE WHEN COALESCE(ss.mgr_scored,false) AND COALESCE(rw.mgr_w,0) > 0
           THEN ROUND(ss.mgr_s / rw.mgr_w, 2)
         WHEN COALESCE(ss.mgr_sub,false) THEN kp.kra_rating_5 END,
    CASE WHEN COALESCE(ss.dh_scored,false) AND COALESCE(rw.dh_w,0) > 0
           THEN ROUND(ss.dh_s / rw.dh_w, 2)
         WHEN COALESCE(ss.dh_sub,false) THEN kp.kra_rating_5 END,
    CASE WHEN COALESCE(ss.bu_scored,false) AND COALESCE(rw.bu_w,0) > 0
           THEN ROUND(ss.bu_s / rw.bu_w, 2)
         WHEN COALESCE(ss.bu_sub,false) THEN kp.kra_rating_5 END,
    CASE WHEN COALESCE(ss.hr_scored,false) AND COALESCE(rw.hr_w,0) > 0
           THEN ROUND(ss.hr_s / rw.hr_w, 2)
         WHEN COALESCE(ss.hr_sub,false) THEN kp.kra_rating_5 END,
    CASE WHEN COALESCE(ss.mg_scored,false) AND COALESCE(rw.mg_w,0) > 0
           THEN ROUND(ss.mg_s / rw.mg_w, 2)
         WHEN COALESCE(ss.mg_sub,false) THEN kp.kra_rating_5 END,
    CASE
      WHEN COALESCE(tw.criteria_weight, 0) > 0
       AND (COALESCE(ss.self_scored,false) OR COALESCE(ss.mgr_scored,false)
            OR COALESCE(ss.dh_scored,false) OR COALESCE(ss.bu_scored,false)
            OR COALESCE(ss.hr_scored,false) OR COALESCE(ss.mg_scored,false))
        THEN 'criteria'
      WHEN COALESCE(tw.kra_weight, 0) > 0 THEN 'kra'
      ELSE 'none'
    END,
    -- ADR-181 — eligibility answers for per-question report columns.
    COALESCE(i.eligibility_inputs, '{}'::jsonb)
  FROM public.annual_review_instances i
  JOIN public.profiles p         ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN public.divisions div ON div.id = bu.division_id
  LEFT JOIN public.profiles pm   ON pm.id = i.manager_id
  LEFT JOIN public.profiles pdh  ON pdh.id = i.dept_head_id
  LEFT JOIN public.profiles pbu  ON pbu.id = i.bu_head_id
  LEFT JOIN public.profiles phr  ON phr.id = i.hr_id
  LEFT JOIN public.profiles pmg  ON pmg.id = i.management_id
  LEFT JOIN stage_data ss        ON ss.instance_id = i.id
  LEFT JOIN public.annual_review_templates t
         ON t.id = COALESCE(i.template_override_id, i.template_id)
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric, 0)), 0)
         FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c)      AS criteria_weight,
      (SELECT COALESCE(SUM(COALESCE((s->>'weight')::numeric, 0)), 0)
         FROM jsonb_array_elements(COALESCE(t.sections->'system_scores','[]'::jsonb)) s) AS system_weight,
      (SELECT COALESCE(SUM(COALESCE((s->>'weight')::numeric, 0)), 0)
         FROM jsonb_array_elements(COALESCE(t.sections->'system_scores','[]'::jsonb)) s
        WHERE s->>'source' = 'carry_kra')                                                AS kra_weight
  ) tw ON true
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric,0)),0) FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c WHERE c->'reviewer_stages' ? 'self')       AS self_w,
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric,0)),0) FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c WHERE c->'reviewer_stages' ? 'manager')    AS mgr_w,
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric,0)),0) FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c WHERE c->'reviewer_stages' ? 'dept_head')  AS dh_w,
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric,0)),0) FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c WHERE c->'reviewer_stages' ? 'bu_head')    AS bu_w,
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric,0)),0) FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c WHERE c->'reviewer_stages' ? 'hr')         AS hr_w,
      (SELECT COALESCE(SUM(COALESCE((c->>'weight')::numeric,0)),0) FROM jsonb_array_elements(COALESCE(t.sections->'criteria','[]'::jsonb)) c WHERE c->'reviewer_stages' ? 'management') AS mg_w
  ) rw ON true
  LEFT JOIN LATERAL (
    SELECT
      pts AS kra_points,
      CASE WHEN COALESCE(tw.kra_weight,0) > 0
             THEN ROUND(LEAST(5, GREATEST(0, pts / tw.kra_weight * 5)), 2)
      END AS kra_rating_5
    FROM (
      SELECT COALESCE(SUM(COALESCE((i.system_scores ->> (s->>'id'))::numeric, 0)), 0) AS pts
      FROM jsonb_array_elements(COALESCE(t.sections->'system_scores','[]'::jsonb)) s
      WHERE s->>'source' = 'carry_kra'
    ) q
  ) kp ON true
  WHERE i.cycle_id = p_cycle_id
    AND (
      v_scope = 'all'
      OR (v_scope = 'bu' AND d.business_unit_id = ANY(v_bu_ids))
      OR (v_scope = 'team' AND i.employee_id = ANY(v_subtree))
    )
  ORDER BY COALESCE(d.name,''), COALESCE(bu.name,''), COALESCE(p.full_name,'');
END;
$function$;
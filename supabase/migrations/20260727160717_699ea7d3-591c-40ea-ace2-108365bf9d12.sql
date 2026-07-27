-- ADR-182 / POLICY §RPT-RECOMMENDATION-COLUMNS
-- Companion read-only RPC exposing the Overall Recommendation authored by
-- dept_head / bu_head / management on the annual review form.
CREATE OR REPLACE FUNCTION public.get_annual_review_recommendations(p_cycle_id uuid)
RETURNS TABLE(
  instance_id uuid,
  dept_head_recommendation text,
  bu_head_recommendation text,
  management_recommendation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_access jsonb;
  v_scope text;
  v_bu_ids uuid[];
  v_subtree uuid[];
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

  RETURN QUERY
  SELECT
    i.id,
    MAX(NULLIF(btrim(r.qualitative_responses ->> '__overall_recommendation'), ''))
      FILTER (WHERE r.reviewer_role = 'dept_head'),
    MAX(NULLIF(btrim(r.qualitative_responses ->> '__overall_recommendation'), ''))
      FILTER (WHERE r.reviewer_role = 'bu_head'),
    MAX(NULLIF(btrim(r.qualitative_responses ->> '__overall_recommendation'), ''))
      FILTER (WHERE r.reviewer_role = 'management')
  FROM public.annual_review_instances i
  JOIN public.profiles p ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  JOIN public.annual_review_responses r ON r.instance_id = i.id
  WHERE i.cycle_id = p_cycle_id
    AND (
      v_scope = 'all'
      OR (v_scope = 'bu' AND d.business_unit_id = ANY(v_bu_ids))
      OR (v_scope = 'team' AND i.employee_id = ANY(v_subtree))
    )
  GROUP BY i.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_annual_review_recommendations(uuid) TO authenticated;

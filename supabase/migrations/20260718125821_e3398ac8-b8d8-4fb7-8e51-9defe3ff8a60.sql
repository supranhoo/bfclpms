CREATE OR REPLACE FUNCTION public.repair_all_orphan_criteria_scores(
  p_dry_run boolean DEFAULT true,
  p_include_completed boolean DEFAULT false
)
RETURNS TABLE(
  instance_id uuid,
  employee_code text,
  status text,
  detected_prev_template uuid,
  overlap_keys integer,
  orphan_keys_before integer,
  response_rows integer,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_prev uuid;
  v_overlap integer;
  v_touched integer;
BEGIN
  IF v_uid IS NOT NULL AND NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can run bulk repair';
  END IF;

  FOR r IN
    WITH eff AS (
      SELECT ari.id AS iid, ari.employee_id, ari.overall_status,
             COALESCE(ari.template_override_id, ari.template_id) AS cur_tpl
      FROM public.annual_review_instances ari
      WHERE ari.overall_status <> 'excluded'
        AND (p_include_completed OR ari.overall_status <> 'completed')
    ),
    tpl AS (
      SELECT t.id AS tpl_id,
             COALESCE(array_agg(c->>'id') FILTER (WHERE c->>'id' IS NOT NULL), '{}') AS crit_ids
      FROM public.annual_review_templates t
      LEFT JOIN LATERAL jsonb_array_elements(t.sections->'criteria') c ON TRUE
      GROUP BY t.id
    ),
    resp_keys AS (
      SELECT arr.instance_id, array_agg(DISTINCT k) AS all_keys
      FROM public.annual_review_responses arr,
           LATERAL jsonb_object_keys(COALESCE(arr.criteria_scores,'{}'::jsonb)) k
      GROUP BY arr.instance_id
    )
    SELECT eff.iid, eff.employee_id, eff.overall_status::text AS ostatus,
           eff.cur_tpl,
           (SELECT array_agg(k) FROM unnest(rk.all_keys) k
              WHERE k <> ALL((SELECT crit_ids FROM tpl WHERE tpl_id = eff.cur_tpl))
           ) AS orphan_keys
    FROM eff
    JOIN resp_keys rk ON rk.instance_id = eff.iid
    WHERE EXISTS (
      SELECT 1 FROM unnest(rk.all_keys) k
      WHERE k <> ALL((SELECT crit_ids FROM tpl WHERE tpl_id = eff.cur_tpl))
    )
  LOOP
    -- Pick the template with the highest overlap against the orphan keys.
    SELECT t.id,
           (SELECT count(*) FROM unnest(r.orphan_keys) k
             WHERE k = ANY(COALESCE(array_agg(c.cid), '{}')))
      INTO v_prev, v_overlap
    FROM public.annual_review_templates t
    LEFT JOIN LATERAL (
      SELECT (c->>'id') AS cid FROM jsonb_array_elements(t.sections->'criteria') c
    ) c ON TRUE
    WHERE t.id <> r.cur_tpl
    GROUP BY t.id
    ORDER BY 2 DESC, t.updated_at DESC NULLS LAST
    LIMIT 1;

    instance_id := r.iid;
    SELECT p.employee_code INTO employee_code FROM public.profiles p WHERE p.id = r.employee_id;
    status := r.ostatus;
    detected_prev_template := v_prev;
    overlap_keys := COALESCE(v_overlap, 0);
    orphan_keys_before := cardinality(r.orphan_keys);
    response_rows := 0;

    IF v_prev IS NULL OR COALESCE(v_overlap,0) = 0 THEN
      action := 'skipped_no_match';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      action := 'dry_run';
      RETURN NEXT;
      CONTINUE;
    END IF;

    v_touched := public.remap_annual_review_criteria_scores(r.iid, v_prev);
    response_rows := v_touched;
    action := 'repaired';

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES (
      'annual_review.bulk_orphan_repair',
      v_uid,
      jsonb_build_object(
        'instance_id', r.iid,
        'employee_id', r.employee_id,
        'status', r.ostatus,
        'current_template', r.cur_tpl,
        'detected_prev_template', v_prev,
        'overlap_keys', v_overlap,
        'orphan_keys_before', cardinality(r.orphan_keys),
        'response_rows_touched', v_touched
      )
    );

    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_all_orphan_criteria_scores(boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_all_orphan_criteria_scores(boolean, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_repair_sep_2026_rollover_incident(
  p_dry_run boolean DEFAULT true,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_incident_key constant text := 'ADR-333-2026-09-01-AUG-SEP-ROLLOVER';
  v_candidate_count integer;
  v_audit_count integer;
  v_submission_count integer;
  v_observation_count integer;
  v_query_count integer;
  v_assignment_count integer;
  v_employee_count integer;
  v_manifest jsonb;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
     AND (v_actor IS NULL OR NOT public.has_role(v_actor, 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Privileged backend access required';
  END IF;

  IF NOT p_dry_run AND length(btrim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'A repair reason of at least 10 characters is required';
  END IF;

  CREATE TEMP TABLE _adr333_candidates ON COMMIT DROP AS
  WITH prepared_employees AS (
    SELECT DISTINCT employee_id
    FROM public.kpis
    WHERE review_period = 'September'
      AND review_year = 2026
      AND created_at < timestamptz '2026-09-01 00:00:00+00'
  )
  SELECT k.*
  FROM public.kpis k
  JOIN prepared_employees p ON p.employee_id = k.employee_id
  WHERE k.created_at >= timestamptz '2026-09-01 00:00:00+00'
    AND k.created_at < timestamptz '2026-09-01 00:01:00+00'
    AND k.review_year = 2026
    AND k.review_period IN ('September', 'October');

  SELECT count(*), count(DISTINCT employee_id)
  INTO v_candidate_count, v_employee_count
  FROM _adr333_candidates;

  SELECT count(*) INTO v_audit_count
  FROM public.kpi_audit_logs a
  JOIN _adr333_candidates c ON c.id = a.kpi_id;

  SELECT count(*) INTO v_submission_count
  FROM public.review_submissions r
  JOIN _adr333_candidates c ON c.id = r.kpi_id;

  SELECT count(*) INTO v_observation_count
  FROM public.kpi_observations o
  JOIN _adr333_candidates c ON c.id = o.kpi_id;

  SELECT count(*) INTO v_query_count
  FROM public.kpi_queries q
  JOIN _adr333_candidates c ON c.id = q.kpi_id;

  SELECT count(*) INTO v_assignment_count
  FROM public.audit_kpi_level_assignments a
  JOIN _adr333_candidates c ON c.id = a.kpi_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.employee_code), '[]'::jsonb)
  INTO v_manifest
  FROM (
    SELECT p.employee_code, p.full_name,
           count(*) FILTER (WHERE c.review_period = 'September')::integer AS september_rows,
           count(*) FILTER (WHERE c.review_period = 'October')::integer AS cycle_sibling_rows,
           round(COALESCE(sum(c.weightage) FILTER (WHERE c.review_period = 'September'), 0), 2) AS september_weightage_to_remove
    FROM _adr333_candidates c
    JOIN public.profiles p ON p.id = c.employee_id
    GROUP BY p.employee_code, p.full_name
  ) x;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'incident_key', v_incident_key,
      'candidate_kpis', v_candidate_count,
      'affected_employees', v_employee_count,
      'linked_audit_rows', v_audit_count,
      'review_submissions', v_submission_count,
      'observations', v_observation_count,
      'queries', v_query_count,
      'auditor_assignments', v_assignment_count,
      'employees', v_manifest
    );
  END IF;

  IF v_candidate_count <> 347 OR v_employee_count <> 30 OR v_audit_count <> 99 THEN
    RAISE EXCEPTION 'ADR-333 safety baseline changed: candidates %, employees %, audits % (expected 347/30/99)',
      v_candidate_count, v_employee_count, v_audit_count;
  END IF;

  IF v_submission_count <> 0 OR v_observation_count <> 0 OR v_query_count <> 0 OR v_assignment_count <> 0 THEN
    RAISE EXCEPTION 'ADR-333 operational dependencies found: submissions %, observations %, queries %, assignments %',
      v_submission_count, v_observation_count, v_query_count, v_assignment_count;
  END IF;

  INSERT INTO public.kra_rollover_incident_repair_archive (
    incident_key, original_kpi_id, employee_id, review_period, review_year,
    kpi_row, audit_rows, repair_reason, repaired_by
  )
  SELECT v_incident_key,
         c.id,
         c.employee_id,
         c.review_period,
         c.review_year,
         to_jsonb(c),
         COALESCE((
           SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at, a.id)
           FROM public.kpi_audit_logs a
           WHERE a.kpi_id = c.id
         ), '[]'::jsonb),
         btrim(p_reason),
         v_actor
  FROM _adr333_candidates c
  ON CONFLICT (incident_key, original_kpi_id) DO NOTHING;

  IF (SELECT count(*) FROM public.kra_rollover_incident_repair_archive WHERE incident_key = v_incident_key) <> 347 THEN
    RAISE EXCEPTION 'ADR-333 archive verification failed';
  END IF;

  DELETE FROM public.kpis k
  USING _adr333_candidates c
  WHERE k.id = c.id;

  RETURN jsonb_build_object(
    'dry_run', false,
    'incident_key', v_incident_key,
    'deleted_kpis', v_candidate_count,
    'affected_employees', v_employee_count,
    'archived_audit_rows', v_audit_count,
    'employees', v_manifest
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_repair_sep_2026_rollover_incident(boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_repair_sep_2026_rollover_incident(boolean, text) TO service_role;

SELECT public.admin_repair_sep_2026_rollover_incident(
  false,
  'ADR-333: remove redundant September 2026 scheduled rollover rows after complete archival'
);
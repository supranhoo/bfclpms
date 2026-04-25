CREATE OR REPLACE FUNCTION public.get_kpi_journey_report(
  p_period text,
  p_year integer,
  p_department text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_type text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH filtered_kpis AS (
    SELECT
      k.id,
      k.employee_id,
      k.category_id,
      k.kra_name,
      k.kpi_name,
      k.frequency,
      k.status::text AS status,
      k.review_period,
      k.review_year,
      k.created_at,
      k.is_org_level,
      p.employee_code,
      p.full_name,
      d.name AS department_name,
      c.name AS category_name,
      mgr.full_name AS manager_name
    FROM kpis k
    LEFT JOIN profiles p ON p.id = k.employee_id
    LEFT JOIN profiles mgr ON mgr.id = p.reporting_manager_id
    LEFT JOIN departments d ON d.id = p.department_id
    LEFT JOIN kra_categories c ON c.id = k.category_id
    WHERE k.review_year = p_year
      AND k.review_period = p_period
      AND (p_department IS NULL OR d.name = p_department)
      AND (p_type IS NULL
           OR (p_type = 'org' AND k.is_org_level = true)
           OR (p_type = 'individual' AND COALESCE(k.is_org_level, false) = false))
      AND (p_search IS NULL
           OR p.full_name ILIKE '%' || p_search || '%'
           OR p.employee_code ILIKE '%' || p_search || '%'
           OR k.kpi_name ILIKE '%' || p_search || '%'
           OR k.kra_name ILIKE '%' || p_search || '%')
  ),
  sub_data AS (
    SELECT
      rs.kpi_id,
      rs.submitted_at,
      rs.is_na,
      rs.self_score,
      rs.manager_score,
      rs.skip_level_score,
      rs.hr_pms_score,
      rs.auditor_score,
      rs.management_score,
      rs.final_score
    FROM review_submissions rs
    WHERE rs.kpi_id IN (SELECT id FROM filtered_kpis)
  ),
  na_filtered AS (
    SELECT fk.*,
           sd.submitted_at AS sub_submitted_at,
           COALESCE(sd.is_na, false) AS is_na,
           sd.self_score,
           sd.manager_score,
           sd.skip_level_score,
           sd.hr_pms_score,
           sd.auditor_score,
           sd.management_score,
           sd.final_score
    FROM filtered_kpis fk
    LEFT JOIN sub_data sd ON sd.kpi_id = fk.id
    WHERE (p_status IS NULL
           OR (p_status = 'na' AND COALESCE(sd.is_na, false) = true)
           OR (p_status != 'na' AND COALESCE(sd.is_na, false) = false AND fk.status = p_status))
  ),
  counted AS (
    SELECT COUNT(*)::int AS total_count FROM na_filtered
  ),
  summary_send_backs AS (
    SELECT COUNT(*)::int AS total_sb
    FROM kpi_queries kq
    WHERE kq.query_type = 'send_back'
      AND kq.kpi_id IN (SELECT id FROM na_filtered)
  ),
  summary AS (
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE NOT is_na AND status != 'approved')::int AS pending,
      COALESCE(ROUND(AVG(
        CASE WHEN NOT is_na AND sub_submitted_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (sub_submitted_at - created_at)) / 86400.0
        END
      ))::int, 0) AS avg_to_self,
      COALESCE(ROUND(AVG(
        CASE WHEN NOT is_na AND status = 'approved' AND sub_submitted_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (sub_submitted_at - created_at)) / 86400.0
        END
      ))::int, 0) AS avg_to_final
    FROM na_filtered
  ),
  page AS (
    SELECT * FROM na_filtered
    ORDER BY full_name NULLS LAST, kpi_name
    LIMIT p_limit OFFSET p_offset
  ),
  -- FIX #1: read from kpi_audit_logs (canonical), join via kpi_id (uuid).
  -- FIX #2: use project's canonical status vocabulary
  --         (manager_check / skip_level_check / audit) instead of the
  --         non-existent l1_review / skip_level_review / auditor_review.
  transitions AS (
    SELECT
      al.kpi_id AS kpi_id,
      MIN(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'self_review')        AS self_submitted_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'approved')           AS final_approved_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'manager_check')      AS manager_action_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'skip_level_check')   AS skip_level_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'hr_pms_review')      AS hr_pms_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'audit')              AS auditor_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'management_review')  AS management_at
    FROM kpi_audit_logs al
    WHERE al.kpi_id IN (SELECT id FROM page)
    GROUP BY al.kpi_id
  ),
  send_backs_agg AS (
    SELECT
      kq.kpi_id,
      COUNT(*)::int AS sb_count,
      jsonb_agg(
        jsonb_build_object(
          'date', kq.created_at::text,
          'raisedBy', COALESCE(p.full_name, 'Unknown'),
          'reason', COALESCE(kq.reason, '')
        )
        ORDER BY kq.created_at DESC
      ) AS sb_list
    FROM kpi_queries kq
    LEFT JOIN profiles p ON p.id = kq.raised_by
    WHERE kq.query_type = 'send_back'
      AND kq.kpi_id IN (SELECT id FROM page)
    GROUP BY kq.kpi_id
  ),
  emp_workflow AS (
    SELECT DISTINCT
      pg.employee_id,
      ARRAY['self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review']::text[] AS stages
    FROM page pg
  ),
  workflow_chain AS (
    SELECT
      ew.employee_id,
      COALESCE(
        NULLIF(
          string_agg(
            CASE s.stage
              WHEN 'self_review'        THEN 'Self'
              WHEN 'manager_check'      THEN 'L1'
              WHEN 'skip_level_check'   THEN 'Skip'
              WHEN 'hr_pms_review'      THEN 'HR PMS'
              WHEN 'audit'              THEN 'Auditor'
              WHEN 'management_review'  THEN 'Mgmt'
              ELSE NULL
            END,
            ' → '
            ORDER BY ord
          ),
          ''
        ),
        '—'
      ) AS chain
    FROM emp_workflow ew
    LEFT JOIN LATERAL unnest(ew.stages) WITH ORDINALITY AS s(stage, ord) ON true
    GROUP BY ew.employee_id
  ),
  rows_data AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'kpiId', pg.id,
        'employeeCode', COALESCE(pg.employee_code, '—'),
        'employeeName', COALESCE(pg.full_name, 'Unknown'),
        'department', COALESCE(pg.department_name, '—'),
        'reportingManager', COALESCE(pg.manager_name, '—'),
        'category', COALESCE(pg.category_name, '—'),
        'kraName', COALESCE(pg.kra_name, '—'),
        'kpiName', COALESCE(pg.kpi_name, '—'),
        'frequency', COALESCE(pg.frequency, '—'),
        'workflowChain', COALESCE(wc.chain, '—'),
        'reviewPeriod', pg.review_period,
        'reviewYear', pg.review_year,
        'status', COALESCE(pg.status, 'kra_set'),
        'isOrgKpi', COALESCE(pg.is_org_level, false),
        'isNa', pg.is_na,
        'kraAssignedAt', pg.created_at::text,
        'selfSubmittedAt', COALESCE(t.self_submitted_at, CASE WHEN pg.self_score IS NOT NULL OR pg.is_na THEN pg.sub_submitted_at END)::text,
        'managerActionAt', COALESCE(t.manager_action_at, CASE WHEN pg.manager_score IS NOT NULL THEN pg.sub_submitted_at END)::text,
        'skipLevelAt', COALESCE(t.skip_level_at, CASE WHEN pg.skip_level_score IS NOT NULL THEN pg.sub_submitted_at END)::text,
        'hrPmsAt', COALESCE(t.hr_pms_at, CASE WHEN pg.hr_pms_score IS NOT NULL THEN pg.sub_submitted_at END)::text,
        'auditorAt', COALESCE(t.auditor_at, CASE WHEN pg.auditor_score IS NOT NULL THEN pg.sub_submitted_at END)::text,
        'managementAt', COALESCE(t.management_at, CASE WHEN pg.management_score IS NOT NULL THEN pg.sub_submitted_at END)::text,
        'finalApprovedAt', COALESCE(t.final_approved_at, CASE WHEN pg.status = 'approved' AND pg.final_score IS NOT NULL THEN pg.sub_submitted_at END)::text,
        'totalDays', GREATEST(0, EXTRACT(DAY FROM (
          COALESCE(
            t.final_approved_at,
            CASE WHEN pg.status = 'approved' AND pg.final_score IS NOT NULL THEN pg.sub_submitted_at END,
            now()
          ) - pg.created_at
        ))::int),
        'isCompliant', CASE
          WHEN pg.status = 'approved' AND COALESCE(t.final_approved_at, pg.sub_submitted_at) IS NOT NULL
            THEN EXTRACT(DAY FROM (COALESCE(t.final_approved_at, pg.sub_submitted_at) - pg.created_at)) <= 30
          ELSE false
        END,
        'sendBackCount', COALESCE(sb.sb_count, 0),
        'sendBacks', COALESCE(sb.sb_list, '[]'::jsonb)
      )
      ORDER BY pg.full_name NULLS LAST, pg.kpi_name
    ) AS rows
    FROM page pg
    LEFT JOIN transitions t ON t.kpi_id = pg.id
    LEFT JOIN send_backs_agg sb ON sb.kpi_id = pg.id
    LEFT JOIN workflow_chain wc ON wc.employee_id = pg.employee_id
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT rows FROM rows_data), '[]'::jsonb),
    'totalCount', (SELECT total_count FROM counted),
    'summary', jsonb_build_object(
      'total', (SELECT total FROM summary),
      'pending', (SELECT pending FROM summary),
      'avgToSelf', (SELECT avg_to_self FROM summary),
      'avgToFinal', (SELECT avg_to_final FROM summary),
      'totalSendBacks', (SELECT total_sb FROM summary_send_backs)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
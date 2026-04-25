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
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  WITH filtered_kpis AS (
    SELECT
      k.id,
      k.employee_id,
      k.kra_name,
      k.kpi_name,
      k.frequency,
      k.status::text AS status,
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
  paged AS (
    SELECT * FROM na_filtered
    ORDER BY full_name, kra_name, kpi_name
    LIMIT p_limit OFFSET p_offset
  ),
  timeline AS (
    SELECT
      al.kpi_id,
      MIN(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'self_review') AS self_submitted_at,
      MAX(al.created_at) FILTER (WHERE al.action = 'STATUS_TRANSITION' AND (al.new_value->>'status') = 'approved') AS final_approved_at,
      MAX(al.created_at) FILTER (WHERE al.action IN ('MANAGER_FORWARDED','MANAGER_SENT_BACK_TO_EMPLOYEE')) AS manager_action_at,
      MAX(al.created_at) FILTER (WHERE al.action IN ('SKIP_LEVEL_FORWARDED','SKIP_LEVEL_SENT_BACK_TO_MANAGER','SKIP_LEVEL_SENT_BACK_TO_EMPLOYEE')) AS skip_level_at,
      MAX(al.created_at) FILTER (WHERE al.action IN ('HR_PMS_FORWARDED','HR_PMS_SENT_BACK_TO_SKIP_LEVEL','HR_PMS_SENT_BACK_TO_MANAGER','HR_PMS_SENT_BACK_TO_EMPLOYEE')) AS hr_pms_at,
      MAX(al.created_at) FILTER (WHERE al.action IN ('AUDITOR_FORWARDED','AUDITOR_SENT_BACK_TO_HR_PMS','AUDITOR_SENT_BACK_TO_SKIP_LEVEL','AUDITOR_SENT_BACK_TO_MANAGER','AUDITOR_SENT_BACK_TO_EMPLOYEE')) AS auditor_at,
      MAX(al.created_at) FILTER (WHERE al.action IN ('MANAGEMENT_APPROVED','MANAGEMENT_SENT_BACK_TO_AUDITOR','MANAGEMENT_SENT_BACK_TO_HR_PMS','MANAGEMENT_SENT_BACK_TO_SKIP_LEVEL','MANAGEMENT_SENT_BACK_TO_MANAGER','MANAGEMENT_SENT_BACK_TO_EMPLOYEE')) AS management_at
    FROM kpi_audit_logs al
    WHERE al.kpi_id IN (SELECT id FROM paged)
    GROUP BY al.kpi_id
  ),
  send_backs AS (
    SELECT
      kq.kpi_id,
      COUNT(*)::int AS send_back_count,
      jsonb_agg(
        jsonb_build_object(
          'date', kq.created_at::text,
          'raisedBy', COALESCE(sbp.full_name, 'System'),
          'reason', COALESCE(kq.reason, '—')
        ) ORDER BY kq.created_at
      ) AS details
    FROM kpi_queries kq
    LEFT JOIN profiles sbp ON sbp.id = kq.raised_by
    WHERE kq.query_type = 'send_back'
      AND kq.kpi_id IN (SELECT id FROM paged)
    GROUP BY kq.kpi_id
  ),
  -- NEW: resolve the workflow chain per employee for paged rows only
  emp_workflow AS (
    SELECT
      ew.employee_id,
      ew.stages
    FROM (
      SELECT DISTINCT employee_id FROM paged
    ) e
    CROSS JOIN LATERAL (
      SELECT e.employee_id AS employee_id, gw.stages
      FROM get_bulk_employee_workflows(ARRAY[e.employee_id]::uuid[], p_period, p_year) gw
      LIMIT 1
    ) ew
  ),
  workflow_chain AS (
    SELECT
      ew.employee_id,
      COALESCE(
        NULLIF(
          string_agg(
            CASE stage
              WHEN 'self_review'       THEN 'Self'
              WHEN 'manager_check'     THEN 'L1'
              WHEN 'skip_level_check'  THEN 'Skip'
              WHEN 'hr_pms_review'     THEN 'HR PMS'
              WHEN 'audit'             THEN 'Audit'
              WHEN 'management_review' THEN 'Mgmt'
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
        'reviewPeriod', pg.status,
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
          WHEN pg.status = 'approved' THEN
            EXTRACT(DAY FROM (
              COALESCE(t.final_approved_at, CASE WHEN pg.final_score IS NOT NULL THEN pg.sub_submitted_at END, now()) - pg.created_at
            )) <= 30
          ELSE
            EXTRACT(DAY FROM (now() - pg.created_at)) <= 45
        END,
        'sendBackCount', COALESCE(sb.send_back_count, 0),
        'sendBacks', COALESCE(sb.details, '[]'::jsonb)
      )
      ORDER BY pg.full_name, pg.kra_name, pg.kpi_name
    ) AS rows
    FROM paged pg
    LEFT JOIN timeline t ON t.kpi_id = pg.id
    LEFT JOIN send_backs sb ON sb.kpi_id = pg.id
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
  ) INTO result;

  RETURN result;
END;
$function$;
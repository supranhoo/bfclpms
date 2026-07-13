
WITH scoped AS (
  SELECT i.id,
         i.overall_status::text AS old_status,
         i.employee_id,
         i.dept_head_id AS old_dept,
         i.bu_head_id  AS old_bu,
         i.enabled_stages AS old_stages,
         e.employee_code, e.full_name AS emp_name,
         d.head_user_id AS cfg_dept,
         bu.head_user_id AS cfg_bu
  FROM public.annual_review_instances i
  JOIN public.profiles e ON e.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  WHERE i.overall_status IN ('not_started','pending_self','pending_manager','pending_skip','pending_dept')
    AND (i.dept_head_id IS DISTINCT FROM d.head_user_id
      OR i.bu_head_id  IS DISTINCT FROM bu.head_user_id)
),
computed AS (
  SELECT s.*,
    CASE
      WHEN s.employee_id = s.cfg_bu   THEN 'self_is_bu_head'
      WHEN s.employee_id = s.cfg_dept THEN 'self_is_dept_head'
      WHEN s.old_dept IS DISTINCT FROM s.cfg_dept THEN 'dept_head_changed'
      ELSE 'bu_head_changed'
    END AS classification,
    CASE WHEN s.employee_id IN (s.cfg_bu, s.cfg_dept) THEN NULL ELSE s.cfg_dept END AS new_dept,
    CASE WHEN s.employee_id = s.cfg_bu THEN NULL ELSE s.cfg_bu END AS new_bu,
    CASE
      WHEN s.employee_id = s.cfg_bu THEN
        (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(s.old_stages) t(x)
         WHERE x NOT IN ('dept_head','bu_head','hr'))
      WHEN s.employee_id = s.cfg_dept THEN
        (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(s.old_stages) t(x)
         WHERE x <> 'dept_head')
      ELSE s.old_stages
    END AS new_stages
  FROM scoped s
),
snap AS (
  INSERT INTO public.annual_review_head_remap_audit_2026_07
    (instance_id, employee_code, employee_name,
     old_dept_head_id, new_dept_head_id,
     old_bu_head_id,   new_bu_head_id,
     old_overall_status, new_overall_status,
     old_enabled_stages, new_enabled_stages,
     classification, reason)
  SELECT id, employee_code, emp_name,
         old_dept, new_dept, old_bu, new_bu,
         old_status, old_status,
         old_stages, new_stages,
         classification,
         'Pre-approval sweep — org master authoritative (POLICY §AR-HEAD-MASTER-AUTHORITATIVE)'
  FROM computed
  RETURNING 1
)
UPDATE public.annual_review_instances i
SET dept_head_id   = c.new_dept,
    bu_head_id     = c.new_bu,
    enabled_stages = c.new_stages,
    updated_at     = now()
FROM computed c
WHERE i.id = c.id;

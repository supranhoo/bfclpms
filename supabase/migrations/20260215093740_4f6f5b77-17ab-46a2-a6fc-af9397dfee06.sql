
CREATE OR REPLACE VIEW public.eligible_login_users AS
WITH has_kras AS (
  SELECT DISTINCT employee_id AS id FROM kpis
),
is_manager AS (
  SELECT DISTINCT p.reporting_manager_id AS id
  FROM profiles p
  WHERE p.reporting_manager_id IS NOT NULL
    AND p.id IN (SELECT employee_id FROM kpis)
),
is_auditor AS (
  SELECT DISTINCT user_id AS id
  FROM user_roles
  WHERE role = 'auditor'
)
SELECT pr.id, pr.full_name, pr.email, pr.employee_code,
       pr.designation, pr.department_id,
       CASE
         WHEN hk.id IS NOT NULL AND im.id IS NOT NULL THEN 'both'
         WHEN hk.id IS NOT NULL THEN 'has_kras'
         WHEN im.id IS NOT NULL THEN 'reporting_manager'
         ELSE 'auditor'
       END AS eligibility_type
FROM profiles pr
LEFT JOIN has_kras hk ON hk.id = pr.id
LEFT JOIN is_manager im ON im.id = pr.id
LEFT JOIN is_auditor ia ON ia.id = pr.id
WHERE hk.id IS NOT NULL OR im.id IS NOT NULL OR ia.id IS NOT NULL;

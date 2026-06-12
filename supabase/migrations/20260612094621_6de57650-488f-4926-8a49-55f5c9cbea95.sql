
-- Backfill display names on safety_incident_evidence so they follow the
-- {Stage}_{EmployeeCode}_v{n} convention, matching src/lib/safetyEvidenceNaming.ts.
WITH ordered AS (
  SELECT
    e.id,
    e.stage,
    e.uploaded_by,
    e.file_name AS current_name,
    e.original_file_name,
    row_number() OVER (
      PARTITION BY e.incident_id, e.stage, e.uploaded_by
      ORDER BY e.uploaded_at, e.id
    ) AS seq
  FROM public.safety_incident_evidence e
),
labeled AS (
  SELECT
    o.id,
    o.current_name,
    o.original_file_name,
    CASE o.stage::text
      WHEN 'report'        THEN 'Reported'
      WHEN 'assignment'    THEN 'Assignment'
      WHEN 'investigation' THEN 'Investigation'
      WHEN 'rca'           THEN 'RCA'
      WHEN 'capa'          THEN 'CAPA'
      WHEN 'verification'  THEN 'Verification'
      ELSE initcap(o.stage::text)
    END AS stage_label,
    COALESCE(
      NULLIF(regexp_replace(p.employee_code, '[^a-zA-Z0-9]', '', 'g'), ''),
      upper(substr(replace(o.uploaded_by::text, '-', ''), 1, 8))
    ) AS emp_code,
    o.seq
  FROM ordered o
  LEFT JOIN public.profiles p ON p.id = o.uploaded_by
)
UPDATE public.safety_incident_evidence e
SET
  original_file_name = COALESCE(e.original_file_name, l.current_name),
  file_name = l.stage_label || '_' || l.emp_code || '_v' || l.seq
FROM labeled l
WHERE l.id = e.id;

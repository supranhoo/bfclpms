
-- 1) BEFORE INSERT trigger: enforce {Stage}_{EmployeeCode}_v{n} display name
CREATE OR REPLACE FUNCTION public.safety_evidence_autoname()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_label TEXT;
  v_emp_code TEXT;
  v_seq INT;
  v_pattern TEXT;
BEGIN
  -- Preserve original filename once.
  IF NEW.original_file_name IS NULL OR NEW.original_file_name = '' THEN
    NEW.original_file_name := NEW.file_name;
  END IF;

  v_stage_label := CASE NEW.stage::text
    WHEN 'report'        THEN 'Reported'
    WHEN 'assignment'    THEN 'Assignment'
    WHEN 'investigation' THEN 'Investigation'
    WHEN 'rca'           THEN 'RCA'
    WHEN 'capa'          THEN 'CAPA'
    WHEN 'verification'  THEN 'Verification'
    ELSE initcap(NEW.stage::text)
  END;

  SELECT COALESCE(
    NULLIF(regexp_replace(p.employee_code, '[^a-zA-Z0-9]', '', 'g'), ''),
    upper(substr(replace(NEW.uploaded_by::text, '-', ''), 1, 8))
  )
  INTO v_emp_code
  FROM public.profiles p
  WHERE p.id = NEW.uploaded_by;

  IF v_emp_code IS NULL THEN
    v_emp_code := upper(substr(replace(NEW.uploaded_by::text, '-', ''), 1, 8));
  END IF;

  -- If file_name already matches the convention for this stage+emp, keep it.
  v_pattern := '^' || v_stage_label || '_' || v_emp_code || '_v\d+$';
  IF NEW.file_name ~ v_pattern THEN
    RETURN NEW;
  END IF;

  -- Compute next sequence within (incident, stage, uploader).
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(file_name, '^.*_v(\d+)$', '\1'), file_name)::INT
  ), 0) + 1
  INTO v_seq
  FROM public.safety_incident_evidence
  WHERE incident_id = NEW.incident_id
    AND stage = NEW.stage
    AND uploaded_by = NEW.uploaded_by
    AND file_name ~ ('^' || v_stage_label || '_' || v_emp_code || '_v\d+$');

  NEW.file_name := v_stage_label || '_' || v_emp_code || '_v' || v_seq;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_safety_evidence_autoname ON public.safety_incident_evidence;
CREATE TRIGGER trg_safety_evidence_autoname
BEFORE INSERT ON public.safety_incident_evidence
FOR EACH ROW EXECUTE FUNCTION public.safety_evidence_autoname();

-- 2) Backfill rows still using the raw original filename.
WITH ordered AS (
  SELECT
    e.id, e.stage, e.uploaded_by, e.file_name AS current_name, e.original_file_name,
    row_number() OVER (
      PARTITION BY e.incident_id, e.stage, e.uploaded_by
      ORDER BY e.uploaded_at, e.id
    ) AS seq
  FROM public.safety_incident_evidence e
),
labeled AS (
  SELECT
    o.id, o.current_name, o.original_file_name,
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
WHERE l.id = e.id
  AND e.file_name !~ ('^' || l.stage_label || '_' || l.emp_code || '_v\d+$');

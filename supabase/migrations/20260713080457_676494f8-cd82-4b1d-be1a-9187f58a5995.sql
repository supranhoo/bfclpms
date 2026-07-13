
-- =====================================================================
-- Annual Review — Strict reviewer re-mapping + org-head cascade trigger
-- Policy: POLICY.md §AR-HEAD-MASTER-AUTHORITATIVE (revised 2026-07-13)
--   1. Employee IS BU head       → chain ends after skip; no dept/bu/hr
--   2. Employee IS Dept head     → skip dept stage
--   3. Manager is NEVER a fallback for dept/bu; missing head = stage skipped
-- =====================================================================

-- Audit table for this correction sweep (reusing 2026_07 pattern)
CREATE TABLE IF NOT EXISTS public.annual_review_head_remap_audit_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_code text,
  employee_name text,
  old_dept_head_id uuid,
  new_dept_head_id uuid,
  old_bu_head_id uuid,
  new_bu_head_id uuid,
  old_overall_status text,
  new_overall_status text,
  old_enabled_stages jsonb,
  new_enabled_stages jsonb,
  classification text NOT NULL,
  reason text,
  corrected_by uuid,
  corrected_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.annual_review_head_remap_audit_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_head_remap_audit_2026_07 TO service_role;
ALTER TABLE public.annual_review_head_remap_audit_2026_07 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_hr_read_head_remap_audit" ON public.annual_review_head_remap_audit_2026_07
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

-- =====================================================================
-- Snapshot + correct in one CTE pass
-- =====================================================================
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
  WHERE i.overall_status IN ('pending_bu','pending_hr','completed')
    AND (i.dept_head_id IS DISTINCT FROM d.head_user_id
      OR i.bu_head_id  IS DISTINCT FROM bu.head_user_id)
),
classified AS (
  SELECT s.*,
    CASE
      WHEN s.employee_id = s.cfg_bu   THEN 'self_is_bu_head'
      WHEN s.employee_id = s.cfg_dept THEN 'self_is_dept_head'
      WHEN s.dept_head_id_wrong THEN 'dept_head_changed'
      WHEN s.bu_head_id_wrong   THEN 'bu_head_changed'
      ELSE 'already_correct'
    END AS classification,
    -- new columns
    CASE
      WHEN s.employee_id = s.cfg_bu THEN NULL
      WHEN s.employee_id = s.cfg_dept THEN NULL
      ELSE s.cfg_dept
    END AS new_dept,
    CASE
      WHEN s.employee_id = s.cfg_bu THEN NULL
      ELSE s.cfg_bu
    END AS new_bu,
    -- new enabled_stages
    CASE
      WHEN s.employee_id = s.cfg_bu THEN
        -- drop dept_head, bu_head, hr
        (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(s.old_stages) t(x)
         WHERE x NOT IN ('dept_head','bu_head','hr'))
      WHEN s.employee_id = s.cfg_dept THEN
        (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(s.old_stages) t(x)
         WHERE x <> 'dept_head')
      ELSE s.old_stages
    END AS new_stages,
    -- was dept approved by the WRONG person?
    EXISTS (
      SELECT 1 FROM public.annual_review_responses r
      WHERE r.instance_id = s.id
        AND r.reviewer_role = 'dept_head'
        AND r.submitted_at IS NOT NULL
    ) AS dept_was_approved
  FROM (
    SELECT s.*,
      (s.old_dept IS DISTINCT FROM s.cfg_dept) AS dept_head_id_wrong,
      (s.old_bu   IS DISTINCT FROM s.cfg_bu)   AS bu_head_id_wrong
    FROM scoped s
  ) s
),
targeted AS (
  SELECT c.*,
    CASE
      -- Completed cases: leave as-is (audit only)
      WHEN c.old_status = 'completed' THEN c.old_status
      -- Self-is-BU-head: after skip approves, becomes completed
      WHEN c.classification = 'self_is_bu_head' THEN
        CASE WHEN c.old_status IN ('pending_bu','pending_hr') THEN 'completed'
             ELSE c.old_status END
      -- Self-is-dept-head: dept stage removed, advance stays pending_bu
      WHEN c.classification = 'self_is_dept_head' THEN c.old_status
      -- Dept changed AND was approved by the wrong person: step back
      WHEN c.classification = 'dept_head_changed' AND c.dept_was_approved
        THEN 'pending_dept'
      -- Dept changed but never approved: just rewrite id, keep status
      ELSE c.old_status
    END AS new_status
  FROM classified c
),
snapshot AS (
  INSERT INTO public.annual_review_head_remap_audit_2026_07
    (instance_id, employee_code, employee_name,
     old_dept_head_id, new_dept_head_id,
     old_bu_head_id,   new_bu_head_id,
     old_overall_status, new_overall_status,
     old_enabled_stages, new_enabled_stages,
     classification, reason, corrected_by)
  SELECT t.id, t.employee_code, t.emp_name,
         t.old_dept, t.new_dept,
         t.old_bu,   t.new_bu,
         t.old_status, t.new_status,
         t.old_stages, t.new_stages,
         t.classification,
         'Strict re-mapping — org master authoritative (POLICY §AR-HEAD-MASTER-AUTHORITATIVE)',
         NULL
  FROM targeted t
  RETURNING instance_id, new_overall_status
),
-- Clear dept_head response where we're stepping back
cleared AS (
  DELETE FROM public.annual_review_responses r
  USING targeted t
  WHERE r.instance_id = t.id
    AND r.reviewer_role = 'dept_head'
    AND t.classification = 'dept_head_changed'
    AND t.dept_was_approved
    AND t.old_status <> 'completed'
  RETURNING r.instance_id
)
UPDATE public.annual_review_instances i
SET dept_head_id   = t.new_dept,
    bu_head_id     = t.new_bu,
    enabled_stages = t.new_stages,
    overall_status = t.new_status::annual_review_status,
    updated_at     = now()
FROM targeted t
WHERE i.id = t.id
  AND t.old_status <> 'completed';  -- completed rows: audit only, no data change

-- =====================================================================
-- Cascade trigger — future org-master edits propagate pre-approval only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_cascade_department_head_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    -- Rewrite dept_head_id on any active-cycle instance not yet past dept stage
    UPDATE public.annual_review_instances i
    SET dept_head_id = CASE
                         -- self-is-dept-head → NULL (stage removed)
                         WHEN i.employee_id = NEW.head_user_id THEN NULL
                         ELSE NEW.head_user_id
                       END,
        enabled_stages = CASE
                           WHEN i.employee_id = NEW.head_user_id THEN
                             (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(i.enabled_stages) t(x) WHERE x <> 'dept_head')
                           ELSE i.enabled_stages
                         END,
        updated_at = now()
    FROM public.profiles e
    JOIN public.annual_review_cycles c ON c.status IN ('open','active')
    WHERE i.employee_id = e.id
      AND e.department_id = NEW.id
      AND i.cycle_id = c.id
      AND i.overall_status IN ('not_started','pending_self','pending_manager','pending_skip','pending_dept');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_cascade_bu_head_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    UPDATE public.annual_review_instances i
    SET bu_head_id = CASE
                       WHEN i.employee_id = NEW.head_user_id THEN NULL
                       ELSE NEW.head_user_id
                     END,
        enabled_stages = CASE
                           WHEN i.employee_id = NEW.head_user_id THEN
                             (SELECT jsonb_agg(x) FROM jsonb_array_elements_text(i.enabled_stages) t(x) WHERE x NOT IN ('bu_head','hr'))
                           ELSE i.enabled_stages
                         END,
        updated_at = now()
    FROM public.profiles e
    JOIN public.departments d ON d.id = e.department_id
    JOIN public.annual_review_cycles c ON c.status IN ('open','active')
    WHERE i.employee_id = e.id
      AND d.business_unit_id = NEW.id
      AND i.cycle_id = c.id
      AND i.overall_status IN ('not_started','pending_self','pending_manager','pending_skip','pending_dept','pending_bu');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_department_head_change ON public.departments;
CREATE TRIGGER trg_cascade_department_head_change
  AFTER UPDATE OF head_user_id ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_cascade_department_head_change();

DROP TRIGGER IF EXISTS trg_cascade_bu_head_change ON public.business_units;
CREATE TRIGGER trg_cascade_bu_head_change
  AFTER UPDATE OF head_user_id ON public.business_units
  FOR EACH ROW EXECUTE FUNCTION public.tg_cascade_bu_head_change();

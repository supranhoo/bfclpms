
-- =====================================================================
-- Annual Review — Symmetric head cascade + one-off self_is_*_reverted repair
-- Policy: POLICY §AR-HEAD-MASTER-AUTHORITATIVE / §AR-HEAD-CASCADE-SYMMETRIC
-- RCA: dept CLU-Elect briefly listed Prakash 200549 himself as head → the
-- 2026-07-13 sweep classified 9 in-flight instances as self_is_*_head and
-- stripped the stage; later corrections could not restore the stage because
-- the cascade trigger was remove-only. This migration restores those
-- instances and makes the trigger symmetric.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) Dept Head repair
-- ---------------------------------------------------------------------
WITH scoped AS (
  SELECT i.id,
         i.employee_id,
         i.overall_status::text                            AS old_status,
         i.dept_head_id                                    AS old_dept,
         i.bu_head_id                                      AS old_bu,
         i.enabled_stages                                  AS old_stages,
         d.head_user_id                                    AS cfg_dept,
         e.employee_code,
         e.full_name                                       AS emp_name
  FROM public.annual_review_instances i
  JOIN public.profiles e            ON e.id = i.employee_id AND e.is_active
  JOIN public.departments d         ON d.id = e.department_id
  JOIN public.profiles h            ON h.id = d.head_user_id AND h.is_active
  JOIN public.annual_review_cycles c ON c.id = i.cycle_id AND c.status IN ('open','active')
  WHERE i.overall_status NOT IN ('completed','excluded')
    AND d.head_user_id IS NOT NULL
    AND d.head_user_id <> i.employee_id
    AND (i.dept_head_id IS NULL OR NOT ((i.enabled_stages)::jsonb ? 'dept_head'))
    AND (c.default_enabled_stages)::jsonb ? 'dept_head'
),
enriched AS (
  SELECT s.*,
    EXISTS (
      SELECT 1 FROM public.annual_review_responses r
      WHERE r.instance_id = s.id
        AND r.reviewer_role = 'dept_head'::annual_reviewer_role
        AND r.submitted_at IS NOT NULL
    ) AS dept_was_approved,
    (
      SELECT jsonb_agg(x ORDER BY array_position(
                ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
      FROM (
        SELECT DISTINCT y AS x FROM (
          SELECT jsonb_array_elements_text(s.old_stages) AS y
          UNION ALL SELECT 'dept_head'
        ) u
      ) t
    ) AS new_stages
  FROM scoped s
),
targeted AS (
  SELECT e.*,
    CASE
      WHEN e.old_status = 'pending_bu' AND NOT e.dept_was_approved THEN 'pending_dept'
      WHEN e.old_status = 'pending_hr' AND NOT e.dept_was_approved THEN 'pending_dept'
      ELSE e.old_status
    END AS new_status
  FROM enriched e
),
snap AS (
  INSERT INTO public.annual_review_head_remap_audit_2026_07
    (instance_id, employee_code, employee_name,
     old_dept_head_id, new_dept_head_id,
     old_bu_head_id,   new_bu_head_id,
     old_overall_status, new_overall_status,
     old_enabled_stages, new_enabled_stages,
     classification, reason, corrected_by)
  SELECT t.id, t.employee_code, t.emp_name,
         t.old_dept, t.cfg_dept,
         t.old_bu,   t.old_bu,
         t.old_status, t.new_status,
         t.old_stages, t.new_stages,
         'self_is_dept_head_reverted',
         'Restore dept stage after self-is-dept-head classification reverted (POLICY §AR-HEAD-CASCADE-SYMMETRIC)',
         NULL
  FROM targeted t
  RETURNING instance_id
)
UPDATE public.annual_review_instances i
SET dept_head_id   = t.cfg_dept,
    enabled_stages = t.new_stages,
    overall_status = t.new_status::annual_review_status,
    updated_at     = now()
FROM targeted t
WHERE i.id = t.id;

-- ---------------------------------------------------------------------
-- (b) BU Head repair (symmetric — self_is_bu_head reverted)
-- ---------------------------------------------------------------------
WITH scoped AS (
  SELECT i.id,
         i.employee_id,
         i.overall_status::text                            AS old_status,
         i.dept_head_id                                    AS old_dept,
         i.bu_head_id                                      AS old_bu,
         i.enabled_stages                                  AS old_stages,
         bu.head_user_id                                   AS cfg_bu,
         e.employee_code,
         e.full_name                                       AS emp_name
  FROM public.annual_review_instances i
  JOIN public.profiles e             ON e.id = i.employee_id AND e.is_active
  JOIN public.departments d          ON d.id = e.department_id
  JOIN public.business_units bu      ON bu.id = d.business_unit_id
  JOIN public.profiles h             ON h.id = bu.head_user_id AND h.is_active
  JOIN public.annual_review_cycles c ON c.id = i.cycle_id AND c.status IN ('open','active')
  WHERE i.overall_status NOT IN ('completed','excluded')
    AND bu.head_user_id IS NOT NULL
    AND bu.head_user_id <> i.employee_id
    AND (i.bu_head_id IS NULL OR NOT ((i.enabled_stages)::jsonb ? 'bu_head'))
    AND (c.default_enabled_stages)::jsonb ? 'bu_head'
),
enriched AS (
  SELECT s.*,
    EXISTS (
      SELECT 1 FROM public.annual_review_responses r
      WHERE r.instance_id = s.id
        AND r.reviewer_role = 'bu_head'::annual_reviewer_role
        AND r.submitted_at IS NOT NULL
    ) AS bu_was_approved,
    (
      SELECT jsonb_agg(x ORDER BY array_position(
                ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
      FROM (
        SELECT DISTINCT y AS x FROM (
          SELECT jsonb_array_elements_text(s.old_stages) AS y
          UNION ALL SELECT 'bu_head'
        ) u
      ) t
    ) AS new_stages
  FROM scoped s
),
targeted AS (
  SELECT e.*,
    CASE
      WHEN e.old_status = 'pending_hr' AND NOT e.bu_was_approved THEN 'pending_bu'
      ELSE e.old_status
    END AS new_status
  FROM enriched e
),
snap AS (
  INSERT INTO public.annual_review_head_remap_audit_2026_07
    (instance_id, employee_code, employee_name,
     old_dept_head_id, new_dept_head_id,
     old_bu_head_id,   new_bu_head_id,
     old_overall_status, new_overall_status,
     old_enabled_stages, new_enabled_stages,
     classification, reason, corrected_by)
  SELECT t.id, t.employee_code, t.emp_name,
         t.old_dept, t.old_dept,
         t.old_bu,   t.cfg_bu,
         t.old_status, t.new_status,
         t.old_stages, t.new_stages,
         'self_is_bu_head_reverted',
         'Restore bu stage after self-is-bu-head classification reverted (POLICY §AR-HEAD-CASCADE-SYMMETRIC)',
         NULL
  FROM targeted t
  RETURNING instance_id
)
UPDATE public.annual_review_instances i
SET bu_head_id     = t.cfg_bu,
    enabled_stages = t.new_stages,
    overall_status = t.new_status::annual_review_status,
    updated_at     = now()
FROM targeted t
WHERE i.id = t.id;

-- ---------------------------------------------------------------------
-- (c) Symmetric cascade triggers — add-and-remove, not remove-only
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cascade_department_head_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.head_user_id IS DISTINCT FROM OLD.head_user_id THEN
    UPDATE public.annual_review_instances i
    SET dept_head_id = CASE
                         WHEN i.employee_id = NEW.head_user_id THEN NULL
                         ELSE NEW.head_user_id
                       END,
        enabled_stages = CASE
          WHEN i.employee_id = NEW.head_user_id THEN
            (SELECT jsonb_agg(x ORDER BY array_position(
                       ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
             FROM jsonb_array_elements_text(i.enabled_stages) t(x)
             WHERE x <> 'dept_head')
          WHEN c.default_enabled_stages::jsonb ? 'dept_head'
               AND NEW.head_user_id IS NOT NULL
               AND NEW.head_user_id <> i.employee_id THEN
            (SELECT jsonb_agg(x ORDER BY array_position(
                       ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
             FROM (SELECT DISTINCT y AS x FROM (
                     SELECT jsonb_array_elements_text(i.enabled_stages) y
                     UNION ALL SELECT 'dept_head'
                   ) u) t)
          ELSE i.enabled_stages
        END,
        overall_status = CASE
          -- Step back to pending_dept when a valid dept head is restored on
          -- an instance that skipped dept and hasn't been approved by dept.
          WHEN NEW.head_user_id IS NOT NULL
               AND NEW.head_user_id <> i.employee_id
               AND i.overall_status IN ('pending_bu','pending_hr')
               AND NOT EXISTS (
                 SELECT 1 FROM public.annual_review_responses r
                 WHERE r.instance_id = i.id
                   AND r.reviewer_role = 'dept_head'::annual_reviewer_role
                   AND r.submitted_at IS NOT NULL
               )
          THEN 'pending_dept'::annual_review_status
          ELSE i.overall_status
        END,
        updated_at = now()
    FROM public.profiles e
    JOIN public.annual_review_cycles c ON c.status IN ('open','active')
    WHERE i.employee_id = e.id
      AND e.department_id = NEW.id
      AND i.cycle_id = c.id
      AND i.overall_status NOT IN ('completed','excluded');
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
            (SELECT jsonb_agg(x ORDER BY array_position(
                       ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
             FROM jsonb_array_elements_text(i.enabled_stages) t(x)
             WHERE x NOT IN ('bu_head','hr'))
          WHEN c.default_enabled_stages::jsonb ? 'bu_head'
               AND NEW.head_user_id IS NOT NULL
               AND NEW.head_user_id <> i.employee_id THEN
            (SELECT jsonb_agg(x ORDER BY array_position(
                       ARRAY['self','manager','skip','dept_head','bu_head','hr']::text[], x))
             FROM (SELECT DISTINCT y AS x FROM (
                     SELECT jsonb_array_elements_text(i.enabled_stages) y
                     UNION ALL SELECT 'bu_head'
                   ) u) t)
          ELSE i.enabled_stages
        END,
        overall_status = CASE
          WHEN NEW.head_user_id IS NOT NULL
               AND NEW.head_user_id <> i.employee_id
               AND i.overall_status = 'pending_hr'
               AND NOT EXISTS (
                 SELECT 1 FROM public.annual_review_responses r
                 WHERE r.instance_id = i.id
                   AND r.reviewer_role = 'bu_head'::annual_reviewer_role
                   AND r.submitted_at IS NOT NULL
               )
          THEN 'pending_bu'::annual_review_status
          ELSE i.overall_status
        END,
        updated_at = now()
    FROM public.profiles e
    JOIN public.departments d ON d.id = e.department_id
    JOIN public.annual_review_cycles c ON c.status IN ('open','active')
    WHERE i.employee_id = e.id
      AND d.business_unit_id = NEW.id
      AND i.cycle_id = c.id
      AND i.overall_status NOT IN ('completed','excluded');
  END IF;
  RETURN NEW;
END;
$$;

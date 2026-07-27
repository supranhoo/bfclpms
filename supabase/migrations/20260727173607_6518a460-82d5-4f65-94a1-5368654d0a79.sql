-- ADR-186 security CAPA: sub_period_submissions privilege escalation
-- Employees could set reviewer-owned achieved values on their own KPI rows.

DROP POLICY IF EXISTS "Employees can create their own sub-period submissions" ON public.sub_period_submissions;

CREATE POLICY "Employees can create their own sub-period submissions"
ON public.sub_period_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kpis
    WHERE kpis.id = sub_period_submissions.kpi_id
      AND kpis.employee_id = auth.uid()
  )
  AND manager_achieved_value IS NULL
  AND skip_level_achieved_value IS NULL
  AND hr_pms_achieved_value IS NULL
  AND admin_achieved_value IS NULL
  AND auditor_achieved_value IS NULL
  AND management_achieved_value IS NULL
);

-- RLS WITH CHECK cannot compare against OLD, so the update-side guard is a
-- BEFORE UPDATE trigger: when the actor is the KPI owner (i.e. acting as the
-- employee), reviewer-owned columns are pinned to their stored values.
CREATE OR REPLACE FUNCTION public.guard_sub_period_reviewer_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = NEW.kpi_id AND k.employee_id = auth.uid()
  ) THEN
    NEW.manager_achieved_value     := OLD.manager_achieved_value;
    NEW.skip_level_achieved_value  := OLD.skip_level_achieved_value;
    NEW.hr_pms_achieved_value      := OLD.hr_pms_achieved_value;
    NEW.admin_achieved_value       := OLD.admin_achieved_value;
    NEW.auditor_achieved_value     := OLD.auditor_achieved_value;
    NEW.management_achieved_value  := OLD.management_achieved_value;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sub_period_reviewer_fields ON public.sub_period_submissions;
CREATE TRIGGER trg_guard_sub_period_reviewer_fields
BEFORE UPDATE ON public.sub_period_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_sub_period_reviewer_fields();
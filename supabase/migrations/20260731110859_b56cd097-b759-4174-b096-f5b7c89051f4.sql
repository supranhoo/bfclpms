-- ADR-216 — Stage update access rule must resolve the next stage through the
-- EFFECTIVE chain (duplicate/absent reviewers skipped), matching
-- advance_annual_review_status. Previously it used raw enabled_stages, so when
-- e.g. dept_head_id = bu_head_id the engine wrote pending_bu while the policy
-- only permitted pending_dept -> "new row violates row-level security policy".
--
-- SECURITY DEFINER wrapper avoids RLS recursion: annual_review_effective_chain
-- is SECURITY INVOKER and selects from annual_review_instances, which cannot be
-- referenced from a policy on that same table.

CREATE OR REPLACE FUNCTION public.annual_review_allowed_next_status(
  p_instance_id uuid,
  p_from public.annual_review_status
)
RETURNS public.annual_review_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.annual_review_next_status(
           public.annual_review_effective_chain(p_instance_id),
           p_from
         );
$$;

GRANT EXECUTE ON FUNCTION public.annual_review_allowed_next_status(uuid, public.annual_review_status) TO authenticated, service_role;

-- Rollback: recreate instances_stage_update with the previous WITH CHECK that
-- used annual_review_next_status(enabled_stages, '<pending_x>') for each slot.
DROP POLICY IF EXISTS instances_stage_update ON public.annual_review_instances;

CREATE POLICY instances_stage_update
ON public.annual_review_instances
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (employee_id     = auth.uid() AND overall_status = 'pending_self'::annual_review_status)
  OR (manager_id      = auth.uid() AND overall_status = 'pending_manager'::annual_review_status)
  OR (skip_id         = auth.uid() AND overall_status = 'pending_skip'::annual_review_status)
  OR (dept_head_id    = auth.uid() AND overall_status = 'pending_dept'::annual_review_status)
  OR (bu_head_id      = auth.uid() AND overall_status = 'pending_bu'::annual_review_status)
  OR (hr_id           = auth.uid() AND overall_status = 'pending_hr'::annual_review_status)
  OR (management_id   = auth.uid() AND overall_status = 'pending_management'::annual_review_status)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (employee_id = auth.uid() AND (
        overall_status = 'pending_self'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_self'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_self'::annual_review_status)))
  OR (manager_id = auth.uid() AND (
        overall_status = 'pending_manager'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_manager'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_manager'::annual_review_status)))
  OR (skip_id = auth.uid() AND (
        overall_status = 'pending_skip'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_skip'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_skip'::annual_review_status)))
  OR (dept_head_id = auth.uid() AND (
        overall_status = 'pending_dept'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_dept'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_dept'::annual_review_status)))
  OR (bu_head_id = auth.uid() AND (
        overall_status = 'pending_bu'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_bu'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_bu'::annual_review_status)))
  OR (hr_id = auth.uid() AND (
        overall_status = 'pending_hr'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_hr'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_hr'::annual_review_status)))
  OR (management_id = auth.uid() AND (
        overall_status = 'pending_management'::annual_review_status
     OR overall_status = public.annual_review_next_status(enabled_stages, 'pending_management'::annual_review_status)
     OR overall_status = public.annual_review_allowed_next_status(id, 'pending_management'::annual_review_status)))
);
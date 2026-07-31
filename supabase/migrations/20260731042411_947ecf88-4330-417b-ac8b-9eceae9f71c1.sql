DROP POLICY IF EXISTS instances_stage_update ON public.annual_review_instances;

CREATE POLICY instances_stage_update ON public.annual_review_instances
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (employee_id = auth.uid() AND overall_status = 'pending_self'::annual_review_status)
  OR (manager_id = auth.uid() AND overall_status = 'pending_manager'::annual_review_status)
  OR (skip_id = auth.uid() AND overall_status = 'pending_skip'::annual_review_status)
  OR (dept_head_id = auth.uid() AND overall_status = 'pending_dept'::annual_review_status)
  OR (bu_head_id = auth.uid() AND overall_status = 'pending_bu'::annual_review_status)
  OR (hr_id = auth.uid() AND overall_status = 'pending_hr'::annual_review_status)
  OR (management_id = auth.uid() AND overall_status = 'pending_management'::annual_review_status)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (employee_id = auth.uid() AND overall_status IN ('pending_self'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_self'::annual_review_status)))
  OR (manager_id = auth.uid() AND overall_status IN ('pending_manager'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_manager'::annual_review_status)))
  OR (skip_id = auth.uid() AND overall_status IN ('pending_skip'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_skip'::annual_review_status)))
  OR (dept_head_id = auth.uid() AND overall_status IN ('pending_dept'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_dept'::annual_review_status)))
  OR (bu_head_id = auth.uid() AND overall_status IN ('pending_bu'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_bu'::annual_review_status)))
  OR (hr_id = auth.uid() AND overall_status IN ('pending_hr'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_hr'::annual_review_status)))
  OR (management_id = auth.uid() AND overall_status IN ('pending_management'::annual_review_status, public.annual_review_next_status(enabled_stages, 'pending_management'::annual_review_status)))
);
-- Add dept_head_id to annual_review_instances RLS (SELECT + UPDATE).
-- Rollback: re-run the previous policy bodies without the dept_head_id arm.

DROP POLICY IF EXISTS instances_select_visible ON public.annual_review_instances;
CREATE POLICY instances_select_visible ON public.annual_review_instances
FOR SELECT TO authenticated
USING (
  employee_id  = auth.uid()
  OR manager_id   = auth.uid()
  OR skip_id      = auth.uid()
  OR dept_head_id = auth.uid()
  OR bu_head_id   = auth.uid()
  OR hr_id        = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
);

DROP POLICY IF EXISTS instances_stage_update ON public.annual_review_instances;
CREATE POLICY instances_stage_update ON public.annual_review_instances
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR (employee_id  = auth.uid() AND overall_status = 'pending_self'::annual_review_status)
  OR (manager_id   = auth.uid() AND overall_status = 'pending_manager'::annual_review_status)
  OR (skip_id      = auth.uid() AND overall_status = 'pending_skip'::annual_review_status)
  OR (dept_head_id = auth.uid() AND overall_status = 'pending_dept'::annual_review_status)
  OR (bu_head_id   = auth.uid() AND overall_status = 'pending_bu'::annual_review_status)
  OR (hr_id        = auth.uid() AND overall_status = 'pending_hr'::annual_review_status)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR employee_id  = auth.uid()
  OR manager_id   = auth.uid()
  OR skip_id      = auth.uid()
  OR dept_head_id = auth.uid()
  OR bu_head_id   = auth.uid()
  OR hr_id        = auth.uid()
);
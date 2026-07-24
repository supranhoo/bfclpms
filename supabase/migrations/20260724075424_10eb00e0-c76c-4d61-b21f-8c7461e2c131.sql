
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
  -- Employee submits self -> forwards to any next stage the seeder set up.
  OR (employee_id = auth.uid() AND overall_status IN (
        'pending_self','pending_manager','pending_skip','pending_dept',
        'pending_bu','pending_hr','pending_management','completed'
      ))
  -- Reviewers: allow forward advance, send-back to self, or terminal completion.
  OR (manager_id    = auth.uid() AND overall_status IN (
        'pending_self','pending_manager','pending_skip','pending_dept',
        'pending_bu','pending_hr','pending_management','completed'
      ))
  OR (skip_id       = auth.uid() AND overall_status IN (
        'pending_self','pending_skip','pending_dept',
        'pending_bu','pending_hr','pending_management','completed'
      ))
  OR (dept_head_id  = auth.uid() AND overall_status IN (
        'pending_self','pending_dept',
        'pending_bu','pending_hr','pending_management','completed'
      ))
  OR (bu_head_id    = auth.uid() AND overall_status IN (
        'pending_self','pending_bu',
        'pending_hr','pending_management','completed'
      ))
  OR (hr_id         = auth.uid() AND overall_status IN (
        'pending_self','pending_hr','pending_management','completed'
      ))
  OR (management_id = auth.uid() AND overall_status IN (
        'pending_self','pending_management','completed'
      ))
);

COMMENT ON POLICY instances_stage_update ON public.annual_review_instances IS
  'ADR-152: explicit WITH CHECK permits legal destination statuses per reviewer role, including terminal completion by BU Head / HR / Management. Ownership columns are still pinned by the client-side update payload.';

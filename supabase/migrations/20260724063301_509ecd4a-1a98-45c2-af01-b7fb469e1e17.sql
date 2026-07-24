
-- ADR-150: Extend annual_review_instances RLS for Management terminal stage.
-- Root cause: instances_select_visible and instances_stage_update policies
-- were never updated for the `management_id` reviewer slot introduced in
-- ADR-138. Management users could see the row via the queue RPC + assistance
-- helper but any invoker-scope RPC (send_back / advance / finalize) did
-- SELECT ... INTO v_inst FROM annual_review_instances WHERE id = ...,
-- returned no row, and raised 'instance <uuid> not found'.
--
-- Additive OR-branches only; other reviewer branches are unchanged.

DROP POLICY IF EXISTS instances_select_visible ON public.annual_review_instances;
CREATE POLICY instances_select_visible
  ON public.annual_review_instances
  FOR SELECT
  USING (
    employee_id   = auth.uid()
    OR manager_id   = auth.uid()
    OR skip_id      = auth.uid()
    OR dept_head_id = auth.uid()
    OR bu_head_id   = auth.uid()
    OR hr_id        = auth.uid()
    OR management_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
  );

DROP POLICY IF EXISTS instances_stage_update ON public.annual_review_instances;
CREATE POLICY instances_stage_update
  ON public.annual_review_instances
  FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    OR (employee_id   = auth.uid() AND overall_status = 'pending_self'::annual_review_status)
    OR (manager_id    = auth.uid() AND overall_status = 'pending_manager'::annual_review_status)
    OR (skip_id       = auth.uid() AND overall_status = 'pending_skip'::annual_review_status)
    OR (dept_head_id  = auth.uid() AND overall_status = 'pending_dept'::annual_review_status)
    OR (bu_head_id    = auth.uid() AND overall_status = 'pending_bu'::annual_review_status)
    OR (hr_id         = auth.uid() AND overall_status = 'pending_hr'::annual_review_status)
    OR (management_id = auth.uid() AND overall_status = 'pending_management'::annual_review_status)
  );

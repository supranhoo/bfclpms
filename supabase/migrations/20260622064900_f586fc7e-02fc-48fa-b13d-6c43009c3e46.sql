-- 1. notifications: require auth + recipient
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id IS NOT NULL);

-- 2. entitlement_audit: bind actor_id to current user
DROP POLICY IF EXISTS ent_audit_insert ON public.entitlement_audit;
CREATE POLICY ent_audit_insert
  ON public.entitlement_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- 3. safety_audit_runs: mirror USING into WITH CHECK
DROP POLICY IF EXISTS p_audit_runs_update ON public.safety_audit_runs;
CREATE POLICY p_audit_runs_update
  ON public.safety_audit_runs
  FOR UPDATE
  TO authenticated
  USING (
    status = 'draft'::safety_audit_run_status
    AND (
      conducted_by = auth.uid()
      OR has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
      OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role, NULL::uuid)
      OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role, NULL::uuid)
    )
  )
  WITH CHECK (
    status = 'draft'::safety_audit_run_status
    AND (
      conducted_by = auth.uid()
      OR has_safety_role(auth.uid(), 'admin'::safety_app_role, NULL::uuid)
      OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role, NULL::uuid)
      OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role, NULL::uuid)
    )
  );
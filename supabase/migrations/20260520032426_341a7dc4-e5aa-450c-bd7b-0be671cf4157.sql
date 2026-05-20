-- F-RLS-02: scope all Safety RLS policies to `authenticated` instead of `public`.
-- Same USING / WITH CHECK semantics — only the role list changes.

-- safety_drill_findings
DROP POLICY IF EXISTS drill_findings_read ON public.safety_drill_findings;
CREATE POLICY drill_findings_read ON public.safety_drill_findings
  FOR SELECT TO authenticated
  USING (has_any_safety_role(auth.uid()));

DROP POLICY IF EXISTS drill_findings_write ON public.safety_drill_findings;
CREATE POLICY drill_findings_write ON public.safety_drill_findings
  FOR ALL TO authenticated
  USING (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'supervisor'::safety_app_role)
  )
  WITH CHECK (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'supervisor'::safety_app_role)
  );

-- safety_drill_participants
DROP POLICY IF EXISTS drill_participants_read ON public.safety_drill_participants;
CREATE POLICY drill_participants_read ON public.safety_drill_participants
  FOR SELECT TO authenticated
  USING (has_any_safety_role(auth.uid()));

DROP POLICY IF EXISTS drill_participants_write ON public.safety_drill_participants;
CREATE POLICY drill_participants_write ON public.safety_drill_participants
  FOR ALL TO authenticated
  USING (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'supervisor'::safety_app_role)
  )
  WITH CHECK (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'supervisor'::safety_app_role)
  );

-- safety_emergency_contacts
DROP POLICY IF EXISTS contacts_read_any_safety_role ON public.safety_emergency_contacts;
CREATE POLICY contacts_read_any_safety_role ON public.safety_emergency_contacts
  FOR SELECT TO authenticated
  USING (has_any_safety_role(auth.uid()));

DROP POLICY IF EXISTS contacts_write_admins ON public.safety_emergency_contacts;
CREATE POLICY contacts_write_admins ON public.safety_emergency_contacts
  FOR ALL TO authenticated
  USING (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
  )
  WITH CHECK (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
  );

-- safety_emergency_drills
DROP POLICY IF EXISTS drills_delete_admins ON public.safety_emergency_drills;
CREATE POLICY drills_delete_admins ON public.safety_emergency_drills
  FOR DELETE TO authenticated
  USING (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
  );

DROP POLICY IF EXISTS drills_insert_authorized ON public.safety_emergency_drills;
CREATE POLICY drills_insert_authorized ON public.safety_emergency_drills
  FOR INSERT TO authenticated
  WITH CHECK (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'supervisor'::safety_app_role)
  );

DROP POLICY IF EXISTS drills_read_any_safety_role ON public.safety_emergency_drills;
CREATE POLICY drills_read_any_safety_role ON public.safety_emergency_drills
  FOR SELECT TO authenticated
  USING (has_any_safety_role(auth.uid()));

DROP POLICY IF EXISTS drills_update_authorized ON public.safety_emergency_drills;
CREATE POLICY drills_update_authorized ON public.safety_emergency_drills
  FOR UPDATE TO authenticated
  USING (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'bu_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'supervisor'::safety_app_role)
  );

-- safety_incident_evidence
DROP POLICY IF EXISTS "Delete own evidence or admin" ON public.safety_incident_evidence;
CREATE POLICY "Delete own evidence or admin" ON public.safety_incident_evidence
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR has_safety_role(auth.uid(), 'admin'::safety_app_role)
  );

DROP POLICY IF EXISTS "Upload evidence on visible incidents" ON public.safety_incident_evidence;
CREATE POLICY "Upload evidence on visible incidents" ON public.safety_incident_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    can_view_safety_incident(incident_id) AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS "View evidence for visible incidents" ON public.safety_incident_evidence;
CREATE POLICY "View evidence for visible incidents" ON public.safety_incident_evidence
  FOR SELECT TO authenticated
  USING (can_view_safety_incident(incident_id));

-- safety_incident_progress_logs
DROP POLICY IF EXISTS "Log progress on visible incidents" ON public.safety_incident_progress_logs;
CREATE POLICY "Log progress on visible incidents" ON public.safety_incident_progress_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    can_view_safety_incident(incident_id) AND logged_by = auth.uid()
  );

DROP POLICY IF EXISTS "View progress for visible incidents" ON public.safety_incident_progress_logs;
CREATE POLICY "View progress for visible incidents" ON public.safety_incident_progress_logs
  FOR SELECT TO authenticated
  USING (can_view_safety_incident(incident_id));

-- safety_incident_timeline
DROP POLICY IF EXISTS "View timeline for visible incidents" ON public.safety_incident_timeline;
CREATE POLICY "View timeline for visible incidents" ON public.safety_incident_timeline
  FOR SELECT TO authenticated
  USING (can_view_safety_incident(incident_id));

-- safety_incidents
DROP POLICY IF EXISTS "Safety admins delete incidents" ON public.safety_incidents;
CREATE POLICY "Safety admins delete incidents" ON public.safety_incidents
  FOR DELETE TO authenticated
  USING (has_safety_role(auth.uid(), 'admin'::safety_app_role));

DROP POLICY IF EXISTS "Safety officers/admins update incident metadata" ON public.safety_incidents;
CREATE POLICY "Safety officers/admins update incident metadata" ON public.safety_incidents
  FOR UPDATE TO authenticated
  USING (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR assigned_to = auth.uid()
  );

DROP POLICY IF EXISTS "Safety users can report incidents" ON public.safety_incidents;
CREATE POLICY "Safety users can report incidents" ON public.safety_incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    has_safety_module_access(auth.uid()) AND reporter_id = auth.uid()
  );

DROP POLICY IF EXISTS "Safety users can view incidents in scope" ON public.safety_incidents;
CREATE POLICY "Safety users can view incidents in scope" ON public.safety_incidents
  FOR SELECT TO authenticated
  USING (can_view_safety_incident(id));

-- safety_severity_sla
DROP POLICY IF EXISTS "Safety admins can manage SLA matrix" ON public.safety_severity_sla;
CREATE POLICY "Safety admins can manage SLA matrix" ON public.safety_severity_sla
  FOR ALL TO authenticated
  USING (has_safety_role(auth.uid(), 'admin'::safety_app_role))
  WITH CHECK (has_safety_role(auth.uid(), 'admin'::safety_app_role));

DROP POLICY IF EXISTS "Safety users can read SLA matrix" ON public.safety_severity_sla;
CREATE POLICY "Safety users can read SLA matrix" ON public.safety_severity_sla
  FOR SELECT TO authenticated
  USING (has_safety_module_access(auth.uid()));
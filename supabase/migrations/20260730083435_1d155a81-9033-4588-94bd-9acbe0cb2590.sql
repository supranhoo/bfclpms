-- ============================================================
-- ADR-205 / POLICY §PIP-LIFECYCLE-GOVERNANCE
-- Phase A: unblock the PIP core workflow (server side)
-- ============================================================

-- ---------- A0. Helper: can the caller act on this PIP? ----------
CREATE OR REPLACE FUNCTION public.can_access_pip(_pip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.performance_improvement_plans p
    LEFT JOIN public.profiles emp ON emp.id = p.employee_id
    WHERE p.id = _pip_id
      AND (
        p.employee_id = _user_id
        OR p.initiated_by = _user_id
        OR p.hr_reviewer_id = _user_id
        OR emp.reporting_manager_id = _user_id
        OR public.has_role(_user_id, 'admin'::app_role)
        OR public.has_role(_user_id, 'management'::app_role)
        OR public.has_role(_user_id, 'hr_pms'::app_role)
        OR public.has_role(_user_id, 'auditor'::app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_pip(_pip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.performance_improvement_plans p
    LEFT JOIN public.profiles emp ON emp.id = p.employee_id
    WHERE p.id = _pip_id
      AND (
        p.initiated_by = _user_id
        OR p.hr_reviewer_id = _user_id
        OR emp.reporting_manager_id = _user_id
        OR public.has_role(_user_id, 'admin'::app_role)
        OR public.has_role(_user_id, 'management'::app_role)
        OR public.has_role(_user_id, 'hr_pms'::app_role)
      )
  );
$$;

-- ---------- A1. pip_audit_logs: participation-scoped INSERT ----------
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.pip_audit_logs;
DROP POLICY IF EXISTS "Users can view audit logs of accessible PIPs" ON public.pip_audit_logs;

CREATE POLICY "PIP participants can insert audit logs"
  ON public.pip_audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_pip(pip_id, auth.uid()));

CREATE POLICY "PIP participants can view audit logs"
  ON public.pip_audit_logs FOR SELECT TO authenticated
  USING (public.can_access_pip(pip_id, auth.uid()));

-- performed_by is always the caller; never client-supplied.
CREATE OR REPLACE FUNCTION public.tg_pip_audit_force_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.performed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pip_audit_force_actor ON public.pip_audit_logs;
CREATE TRIGGER trg_pip_audit_force_actor
  BEFORE INSERT ON public.pip_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tg_pip_audit_force_actor();

-- Audit rows are immutable.
DROP POLICY IF EXISTS "PIP audit logs are immutable" ON public.pip_audit_logs;
CREATE POLICY "PIP audit logs are immutable"
  ON public.pip_audit_logs FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

-- ---------- A2. hr_pms access across the PIP tables ----------
DROP POLICY IF EXISTS "Admin and Management can view all PIPs" ON public.performance_improvement_plans;
CREATE POLICY "Admin, Management and HR can view all PIPs"
  ON public.performance_improvement_plans FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
  );

DROP POLICY IF EXISTS "Authorized users can update PIPs" ON public.performance_improvement_plans;
CREATE POLICY "Authorized users can update PIPs"
  ON public.performance_improvement_plans FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR auth.uid() = initiated_by
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR auth.uid() = initiated_by
  );

DROP POLICY IF EXISTS "Managers can create PIPs for team" ON public.performance_improvement_plans;
CREATE POLICY "Managers, HR and Admin can create PIPs"
  ON public.performance_improvement_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR (
      public.has_role(auth.uid(), 'manager'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = performance_improvement_plans.employee_id
          AND p.reporting_manager_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can view milestones of accessible PIPs" ON public.pip_milestones;
CREATE POLICY "Users can view milestones of accessible PIPs"
  ON public.pip_milestones FOR SELECT TO authenticated
  USING (public.can_access_pip(pip_id, auth.uid()));

DROP POLICY IF EXISTS "Managers can manage milestones" ON public.pip_milestones;
CREATE POLICY "Authorized users can insert milestones"
  ON public.pip_milestones FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_pip(pip_id, auth.uid()));

DROP POLICY IF EXISTS "Managers can update milestones" ON public.pip_milestones;
CREATE POLICY "Authorized users can update milestones"
  ON public.pip_milestones FOR UPDATE TO authenticated
  USING (public.can_manage_pip(pip_id, auth.uid()))
  WITH CHECK (public.can_manage_pip(pip_id, auth.uid()));

-- ---------- A3. Transition guard + segregation of duties ----------
CREATE OR REPLACE FUNCTION public.pip_transition_allowed(_from pip_status, _to pip_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _from
    WHEN 'draft'             THEN _to IN ('draft','pending_hr_approval','terminated')
    WHEN 'pending_hr_approval' THEN _to IN ('pending_hr_approval','active','draft','terminated')
    WHEN 'active'            THEN _to IN ('active','extended','completed','terminated')
    WHEN 'extended'          THEN _to IN ('extended','completed','terminated')
    WHEN 'completed'         THEN _to = 'completed'
    WHEN 'terminated'        THEN _to = 'terminated'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_pip_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.pip_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Illegal PIP status transition % -> %', OLD.status, NEW.status
        USING ERRCODE = '22023',
              HINT = 'Allowed path: draft -> pending_hr_approval -> active -> (extended) -> completed | terminated';
    END IF;

    -- Segregation of duties: the initiator may never approve their own PIP.
    IF NEW.status = 'active' AND OLD.status = 'pending_hr_approval' THEN
      IF NEW.hr_reviewer_id IS NULL THEN
        RAISE EXCEPTION 'HR reviewer is required to approve a PIP'
          USING ERRCODE = '22023';
      END IF;
      IF NEW.hr_reviewer_id = NEW.initiated_by THEN
        RAISE EXCEPTION 'The initiator of a PIP cannot approve it (segregation of duties)'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.hr_approved_at IS NULL THEN
        NEW.hr_approved_at := now();
      END IF;
    END IF;

    IF NEW.status = 'completed' THEN
      IF NEW.outcome IS NULL THEN
        RAISE EXCEPTION 'An outcome is required to complete a PIP'
          USING ERRCODE = '22023';
      END IF;
      IF NULLIF(btrim(COALESCE(NEW.completion_remarks, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Completion remarks are required to complete a PIP'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF NEW.status = 'extended' THEN
      IF NEW.extended_end_date IS NULL OR NEW.extended_end_date <= NEW.end_date THEN
        RAISE EXCEPTION 'An extended end date after the original end date is required'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    INSERT INTO public.pip_audit_logs (pip_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.id,
      'status_change',
      v_actor,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('source', 'trg_pip_status_transition', 'automatic', v_actor IS NULL)
    );
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pip_status_transition ON public.performance_improvement_plans;
CREATE TRIGGER trg_pip_status_transition
  BEFORE UPDATE ON public.performance_improvement_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_pip_status_transition();

-- ---------- A4. Notification-safe dispatch ----------
CREATE OR REPLACE FUNCTION public.pip_notify(
  p_pip_id uuid,
  p_event text,
  p_recipient uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pip           public.performance_improvement_plans%ROWTYPE;
  v_actor         uuid := auth.uid();
  v_recipient     uuid;
  v_employee_name text;
  v_title         text;
  v_message       text;
  v_id            uuid;
BEGIN
  IF p_event NOT IN ('pip_initiated', 'pip_completed', 'pip_milestone_reminder') THEN
    RAISE EXCEPTION 'Unsupported PIP notification event: %', p_event
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pip FROM public.performance_improvement_plans WHERE id = p_pip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PIP % not found', p_pip_id USING ERRCODE = 'P0002';
  END IF;

  -- Server/cron context (no JWT) is trusted; a signed-in caller must be a participant.
  IF v_actor IS NOT NULL AND NOT public.can_manage_pip(p_pip_id, v_actor) THEN
    RAISE EXCEPTION 'Not authorised to send PIP notifications for this plan'
      USING ERRCODE = '42501';
  END IF;

  v_recipient := COALESCE(p_recipient, v_pip.employee_id);

  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = v_pip.employee_id;

  v_title := CASE p_event
    WHEN 'pip_initiated'           THEN 'Performance Improvement Plan initiated'
    WHEN 'pip_completed'           THEN 'Performance Improvement Plan completed'
    WHEN 'pip_milestone_reminder'  THEN 'PIP milestone due'
  END;

  v_message := CASE p_event
    WHEN 'pip_initiated' THEN
      'A Performance Improvement Plan has been initiated for ' || COALESCE(v_employee_name, 'the employee')
      || ' covering ' || v_pip.start_date || ' to ' || COALESCE(v_pip.extended_end_date, v_pip.end_date) || '.'
    WHEN 'pip_completed' THEN
      'The Performance Improvement Plan for ' || COALESCE(v_employee_name, 'the employee') || ' has been closed.'
    WHEN 'pip_milestone_reminder' THEN
      'A PIP milestone for ' || COALESCE(v_employee_name, 'the employee') || ' needs a review.'
  END;

  INSERT INTO public.notifications (user_id, type, title, message, related_user_id, metadata)
  VALUES (
    v_recipient,
    p_event,
    v_title,
    v_message,
    v_actor,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'pip_id',         v_pip.id,
      'pip_start_date', v_pip.start_date,
      'pip_end_date',   COALESCE(v_pip.extended_end_date, v_pip.end_date),
      'pip_reason',     v_pip.reason,
      'pip_outcome',    v_pip.outcome,
      'pip_remarks',    v_pip.completion_remarks,
      'employee_name',  v_employee_name
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pip_notify(uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pip_notify(uuid, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_pip(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_pip(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pip_transition_allowed(pip_status, pip_status) TO authenticated, service_role;

-- ---------- Performance ----------
CREATE INDEX IF NOT EXISTS idx_pip_milestones_date_status
  ON public.pip_milestones (milestone_date, status);
CREATE INDEX IF NOT EXISTS idx_pip_status_employee
  ON public.performance_improvement_plans (status, employee_id);
CREATE INDEX IF NOT EXISTS idx_pip_audit_logs_pip
  ON public.pip_audit_logs (pip_id, created_at DESC);

-- ---------- Configurable SLA settings (Zero-Hardcoding) ----------
DROP POLICY IF EXISTS "Authenticated users can read allowlisted settings" ON public.system_settings;
CREATE POLICY "Authenticated users can read allowlisted settings"
  ON public.system_settings FOR SELECT TO authenticated
  USING (setting_key = ANY (ARRAY[
    'auto_logout_minutes','branding_company_name','branding_loader_rocket_color',
    'branding_loader_show_logo','branding_loader_tagline','branding_max_size_mb',
    'compliance_exclude_bimonthly_not_due','compliance_exclude_halfyearly_not_due',
    'compliance_exclude_org_kpi','compliance_exclude_quarterly_not_due',
    'compliance_exclude_sent_back','compliance_exclude_yearly_not_due',
    'compliance_penalty_auto_remark','compliance_penalty_deadline_day',
    'compliance_penalty_enabled','daily_aggregation_method','dev_report_enabled',
    'dev_report.project_name','dev_report.repository','dev_report.tech_stack',
    'dev_report.workstreams','employee_import_column_order',
    'employee_import_mandatory_fields','employee_master_field_requirements',
    'enable_kpi_canonical_autolink','evidence_allow_paste','evidence_allowed_types',
    'evidence_max_files_per_kpi','evidence_max_size_mb','hub_enforcement_pilot_enabled',
    'hub_platform_settings_enabled','image_compression_enabled','image_compression_policy',
    'import_allowed_types','import_background_threshold','import_duplicate_handling',
    'import_max_rows','import_max_size_mb','kpi_import_column_order',
    'kpi_import_mandatory_fields','kra_export_columns','manager_penalty_auto_remark',
    'max_upload_size_mb','menu_overrides_enabled','pending_review_auto_remark',
    'pending_review_deadline_day','pending_review_effective_from_month',
    'pip_milestone_lead_days','pip_milestone_overdue_days','pip_sla_critical_days',
    'pip_sla_warning_days','pms_pip_threshold','report_overrides_enabled',
    'report_tile_overrides','review_action_notes_visibility','score_calculation_mode',
    'server_compression_enabled','server_compression_pms_rewrite',
    'show_dummy_in_excel','show_dummy_in_frontend'
  ]));
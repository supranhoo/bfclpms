-- ============================================================
-- ADR-207 — PIP trigger suggestions + POLICY §15 completeness
-- ============================================================

-- 1. Additive columns on the plan record -----------------------------------
ALTER TABLE public.performance_improvement_plans
  ADD COLUMN IF NOT EXISTS trigger_source text,
  ADD COLUMN IF NOT EXISTS trigger_context jsonb,
  ADD COLUMN IF NOT EXISTS support_provided text,
  ADD COLUMN IF NOT EXISTS rm2_approver_id uuid,
  ADD COLUMN IF NOT EXISTS rm2_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rm2_remarks text,
  ADD COLUMN IF NOT EXISTS employee_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS employee_ack_comments text,
  ADD COLUMN IF NOT EXISTS monitoring_until date;

COMMENT ON COLUMN public.performance_improvement_plans.trigger_source IS
  'ADR-207: which rule surfaced this plan — monthly_trend | annual_rating | manual';
COMMENT ON COLUMN public.performance_improvement_plans.trigger_context IS
  'ADR-207: evidence snapshot at initiation (threshold, months, scores).';
COMMENT ON COLUMN public.performance_improvement_plans.monitoring_until IS
  'POLICY §15.12: end of the post-PIP sustain window.';

-- 2. Settings (Zero-Hardcoding) --------------------------------------------
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES
  ('pip_require_rm2_approval', 'true'::jsonb, 'POLICY §15.5 — require skip-level (RM2) sign-off before HR can activate a PIP'),
  ('pip_min_duration_days',    '30'::jsonb,   'POLICY §15.7 — minimum PIP duration in days'),
  ('pip_max_duration_days',    '90'::jsonb,   'POLICY §15.7 — maximum PIP duration in days'),
  ('pip_monitor_months',       '3'::jsonb,    'POLICY §15.12 — post-PIP sustain monitoring window in months')
ON CONFLICT (setting_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pip_setting_num(_key text, _fallback numeric)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(trim(both '"' from setting_value::text), '')::numeric
       FROM public.system_settings WHERE setting_key = _key),
    _fallback);
$$;

CREATE OR REPLACE FUNCTION public.pip_setting_bool(_key text, _fallback boolean)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (trim(both '"' from setting_value::text))::boolean
       FROM public.system_settings WHERE setting_key = _key),
    _fallback);
$$;

-- 3. RM2 gate on activation -------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_pip_rm2_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Self-approval as RM2 is never permitted (POLICY §15.5 segregation of duties).
  IF NEW.rm2_approved_at IS NOT NULL
     AND NEW.rm2_approver_id IS NOT NULL
     AND NEW.rm2_approver_id = NEW.initiated_by THEN
    RAISE EXCEPTION 'The initiator cannot provide skip-level (RM2) approval for their own PIP'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'active'::pip_status
     AND OLD.status IS DISTINCT FROM NEW.status
     AND public.pip_setting_bool('pip_require_rm2_approval', true)
     AND NEW.rm2_approved_at IS NULL THEN
    RAISE EXCEPTION 'Skip-level (RM2) approval is required before this PIP can be activated'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pip_rm2_gate ON public.performance_improvement_plans;
CREATE TRIGGER pip_rm2_gate
  BEFORE INSERT OR UPDATE ON public.performance_improvement_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_pip_rm2_gate();

-- 4. RM2 approval RPC -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pip_rm2_approve(p_pip_id uuid, p_remarks text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pip   public.performance_improvement_plans%ROWTYPE;
  v_skip  uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pip FROM public.performance_improvement_plans WHERE id = p_pip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PIP % not found', p_pip_id USING ERRCODE = 'P0002';
  END IF;

  IF v_pip.status <> 'pending_hr_approval'::pip_status THEN
    RAISE EXCEPTION 'Skip-level approval only applies to a plan awaiting approval'
      USING ERRCODE = '22023';
  END IF;

  IF v_actor = v_pip.initiated_by THEN
    RAISE EXCEPTION 'The initiator cannot provide skip-level (RM2) approval for their own PIP'
      USING ERRCODE = '42501';
  END IF;

  -- RM2 = the employee's reporting manager's manager, or dept head; admins /
  -- management may act as the approving authority per POLICY §15.5.
  SELECT m.reporting_manager_id INTO v_skip
    FROM public.profiles e
    LEFT JOIN public.profiles m ON m.id = e.reporting_manager_id
   WHERE e.id = v_pip.employee_id;

  IF NOT (v_actor = v_skip
          OR public.has_role(v_actor, 'admin'::app_role)
          OR public.has_role(v_actor, 'management'::app_role)
          OR public.has_role(v_actor, 'skip_level'::app_role)) THEN
    RAISE EXCEPTION 'Not authorised to provide skip-level approval for this plan'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.performance_improvement_plans
     SET rm2_approver_id = v_actor,
         rm2_approved_at = now(),
         rm2_remarks = p_remarks,
         updated_at = now()
   WHERE id = p_pip_id;

  INSERT INTO public.pip_audit_logs (pip_id, action, performed_by, new_value)
  VALUES (p_pip_id, 'rm2_approved', v_actor, jsonb_build_object('remarks', p_remarks));
END;
$$;

-- 5. Employee acknowledgement RPC (POLICY §15.9) ---------------------------
CREATE OR REPLACE FUNCTION public.pip_acknowledge(p_pip_id uuid, p_comments text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_pip   public.performance_improvement_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_pip FROM public.performance_improvement_plans WHERE id = p_pip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PIP % not found', p_pip_id USING ERRCODE = 'P0002';
  END IF;

  IF v_actor IS NULL OR v_actor <> v_pip.employee_id THEN
    RAISE EXCEPTION 'Only the employee named on the plan can acknowledge it'
      USING ERRCODE = '42501';
  END IF;

  IF v_pip.status NOT IN ('active'::pip_status, 'extended'::pip_status) THEN
    RAISE EXCEPTION 'Only a live plan can be acknowledged' USING ERRCODE = '22023';
  END IF;

  UPDATE public.performance_improvement_plans
     SET employee_acknowledged_at = COALESCE(employee_acknowledged_at, now()),
         employee_ack_comments = COALESCE(p_comments, employee_ack_comments),
         updated_at = now()
   WHERE id = p_pip_id;

  INSERT INTO public.pip_audit_logs (pip_id, action, performed_by, new_value)
  VALUES (p_pip_id, 'employee_acknowledged', v_actor,
          jsonb_build_object('comments', p_comments));
END;
$$;

-- 6. Post-PIP monitoring register (POLICY §15.12) --------------------------
CREATE TABLE IF NOT EXISTS public.pip_monitoring_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pip_id uuid NOT NULL REFERENCES public.performance_improvement_plans(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  period_month date NOT NULL,
  observed_score numeric,
  is_relapse boolean NOT NULL DEFAULT false,
  remarks text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pip_id, period_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pip_monitoring_records TO authenticated;
GRANT ALL ON public.pip_monitoring_records TO service_role;

ALTER TABLE public.pip_monitoring_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pip_monitoring_select" ON public.pip_monitoring_records
  FOR SELECT TO authenticated
  USING (public.can_access_pip(pip_id, auth.uid()));

CREATE POLICY "pip_monitoring_insert" ON public.pip_monitoring_records
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_pip(pip_id, auth.uid()));

CREATE POLICY "pip_monitoring_update" ON public.pip_monitoring_records
  FOR UPDATE TO authenticated
  USING (public.can_manage_pip(pip_id, auth.uid()))
  WITH CHECK (public.can_manage_pip(pip_id, auth.uid()));

CREATE POLICY "pip_monitoring_delete" ON public.pip_monitoring_records
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pip_monitoring_touch
  BEFORE UPDATE ON public.pip_monitoring_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_pip_monitoring_employee
  ON public.pip_monitoring_records (employee_id, period_month DESC);

-- 7. Stamp the monitoring window on successful closure ---------------------
CREATE OR REPLACE FUNCTION public.trg_pip_stamp_monitoring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed'::pip_status
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.monitoring_until IS NULL THEN
    NEW.monitoring_until :=
      (COALESCE(NEW.extended_end_date, NEW.end_date)
        + (public.pip_setting_num('pip_monitor_months', 3) || ' months')::interval)::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pip_stamp_monitoring ON public.performance_improvement_plans;
CREATE TRIGGER pip_stamp_monitoring
  BEFORE UPDATE ON public.performance_improvement_plans
  FOR EACH ROW EXECUTE FUNCTION public.trg_pip_stamp_monitoring();
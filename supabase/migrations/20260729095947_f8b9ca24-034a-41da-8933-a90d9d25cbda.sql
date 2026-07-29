-- =====================================================================
-- ADR-200 — Annual review status must always sit on an ENABLED stage
-- POLICY §AR-STAGE-REVERT-NO-DEAD-END (extended to enabled_stages contraction)
-- =====================================================================

-- 1) first_pending_status was missing dept_head and management.
CREATE OR REPLACE FUNCTION public.annual_review_first_pending_status(p_enabled jsonb)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_first text;
BEGIN
  SELECT s INTO v_first
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('dept_head',4),
                 ('bu_head',5),('hr',6),('management',7)) AS t(s,ord)
   WHERE p_enabled ? t.s
   ORDER BY ord
   LIMIT 1;
  IF v_first IS NULL THEN
    RETURN 'not_started';
  END IF;
  RETURN CASE v_first
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'dept_head'    THEN 'pending_dept'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
    WHEN 'management'   THEN 'pending_management'
  END::public.annual_review_status;
END $function$;

-- 2) Re-anchor helper: given an enabled set and a pending status whose role is
--    disabled, return the nearest enabled stage AT OR AFTER it; if none exists
--    downstream, fall back to the nearest enabled stage BEFORE it.
CREATE OR REPLACE FUNCTION public.annual_review_reanchor_status(
  p_enabled jsonb, p_status public.annual_review_status)
 RETURNS annual_review_status
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord int := public.annual_review_status_ord(p_status::text);
  v_role text;
BEGIN
  IF v_ord IS NULL THEN
    RETURN p_status;                      -- not a pending_* status
  END IF;

  SELECT s INTO v_role
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('dept_head',4),
                 ('bu_head',5),('hr',6),('management',7)) AS t(s,ord)
   WHERE p_enabled ? t.s AND t.ord >= v_ord
   ORDER BY t.ord
   LIMIT 1;

  IF v_role IS NULL THEN
    SELECT s INTO v_role
      FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('dept_head',4),
                   ('bu_head',5),('hr',6),('management',7)) AS t(s,ord)
     WHERE p_enabled ? t.s AND t.ord < v_ord
     ORDER BY t.ord DESC
     LIMIT 1;
  END IF;

  IF v_role IS NULL THEN
    RETURN NULL;                          -- caller decides (no enabled stage)
  END IF;

  RETURN CASE v_role
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'dept_head'    THEN 'pending_dept'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
    WHEN 'management'   THEN 'pending_management'
  END::public.annual_review_status;
END $function$;

-- 3) Invariant trigger: self-heal instead of leaving a dead end.
CREATE OR REPLACE FUNCTION public.enforce_ar_status_within_enabled_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_new  public.annual_review_status;
BEGIN
  IF public.annual_review_status_ord(NEW.overall_status::text) IS NULL THEN
    RETURN NEW;                            -- not_started / completed / excluded
  END IF;

  v_role := CASE NEW.overall_status
    WHEN 'pending_self'       THEN 'self'
    WHEN 'pending_manager'    THEN 'manager'
    WHEN 'pending_skip'       THEN 'skip_manager'
    WHEN 'pending_dept'       THEN 'dept_head'
    WHEN 'pending_bu'         THEN 'bu_head'
    WHEN 'pending_hr'         THEN 'hr'
    WHEN 'pending_management' THEN 'management'
  END;

  IF NEW.enabled_stages ? v_role THEN
    RETURN NEW;
  END IF;

  v_new := public.annual_review_reanchor_status(NEW.enabled_stages, NEW.overall_status);

  IF v_new IS NULL THEN
    RAISE EXCEPTION
      'ADR-200: instance % has no enabled stage that can host status % (enabled_stages=%)',
      NEW.id, NEW.overall_status, NEW.enabled_stages
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.deadend_reanchor', auth.uid(), jsonb_build_object(
    'instance_id',    NEW.id,
    'from_status',    NEW.overall_status,
    'to_status',      v_new,
    'disabled_stage', v_role,
    'enabled_stages', NEW.enabled_stages,
    'reason',         'ADR-200: status pointed at a stage removed from enabled_stages'));

  NEW.overall_status := v_new;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_ar_status_within_enabled_stages ON public.annual_review_instances;
CREATE TRIGGER tg_ar_status_within_enabled_stages
BEFORE INSERT OR UPDATE OF overall_status, enabled_stages
ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.enforce_ar_status_within_enabled_stages();

COMMENT ON FUNCTION public.enforce_ar_status_within_enabled_stages() IS
'ADR-200 / POLICY §AR-STAGE-REVERT-NO-DEAD-END: a pending_* status may never point at a stage absent from enabled_stages; re-anchor forward (else backward) and audit-log.';

-- 4) Rollback snapshot table for the accompanying data repair.
CREATE TABLE IF NOT EXISTS public.annual_review_dept_deadend_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_code text,
  prev_overall_status text,
  new_overall_status text,
  enabled_stages jsonb,
  moved_response_role text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.annual_review_dept_deadend_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_dept_deadend_repair_2026_07 TO service_role;
ALTER TABLE public.annual_review_dept_deadend_repair_2026_07 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read deadend repair snapshot"
ON public.annual_review_dept_deadend_repair_2026_07
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));
-- ADR-117 — Template override is authoritative; template_id must not drift while an override exists.
-- POLICY §AR-TEMPLATE-STABILITY

-- 1. Guard trigger: forbid template_id changes while template_override_id remains set.
--    Allowed paths: force_reset (clears override in same UPDATE) and explicit repair (this migration).
CREATE OR REPLACE FUNCTION public.guard_annual_review_template_id_stability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_bypass text;
BEGIN
  -- Explicit bypass channel used by the repair block below and by future
  -- admin-initiated resync migrations. Kept per-transaction, not session-wide.
  v_bypass := current_setting('app.ar_template_stability_bypass', true);
  IF v_bypass = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.template_id IS DISTINCT FROM NEW.template_id
     AND OLD.template_override_id IS NOT NULL
     AND NEW.template_override_id IS NOT DISTINCT FROM OLD.template_override_id
  THEN
    RAISE EXCEPTION
      'template_id change blocked: instance % has a template override; clear or replace it via set_annual_review_template_override / force_reset_annual_review_instance',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ar_template_id_stability ON public.annual_review_instances;
CREATE TRIGGER trg_guard_ar_template_id_stability
BEFORE UPDATE ON public.annual_review_instances
FOR EACH ROW
EXECUTE FUNCTION public.guard_annual_review_template_id_stability();

-- 2. One-shot repair for the two reported instances whose template_id drifted.
--    Aligns template_id with the intended override, then audit-logs the change.
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.ar_template_stability_bypass', 'on', true);

  FOR r IN
    SELECT i.id, i.employee_id, i.cycle_id, i.template_id AS old_tid, i.template_override_id AS ovr
    FROM public.annual_review_instances i
    JOIN public.profiles p ON p.id = i.employee_id
    WHERE p.employee_code IN ('100357','101762')
      AND i.template_override_id IS NOT NULL
      AND i.template_id IS DISTINCT FROM i.template_override_id
  LOOP
    UPDATE public.annual_review_instances
       SET template_id = r.ovr,
           updated_at  = now()
     WHERE id = r.id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES (
      'annual_review.template_id_resynced', NULL,
      jsonb_build_object(
        'instance_id', r.id,
        'employee_id', r.employee_id,
        'cycle_id', r.cycle_id,
        'old_template_id', r.old_tid,
        'new_template_id', r.ovr,
        'reason', 'ADR-117 drift repair (template_id != template_override_id)'
      )
    );
  END LOOP;

  PERFORM set_config('app.ar_template_stability_bypass', 'off', true);
END $$;


-- Part B: per-employee template override
ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS template_override_id uuid
    REFERENCES public.annual_review_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.annual_review_instances.template_override_id IS
  'Optional per-employee template override. NULL = use template_id (rule-seeded value). Resolution: COALESCE(template_override_id, template_id).';

CREATE INDEX IF NOT EXISTS annual_review_instances_template_override_id_idx
  ON public.annual_review_instances (template_override_id)
  WHERE template_override_id IS NOT NULL;

-- RPC: set / clear a per-instance template override. Admin / hr_pms only.
-- Only allowed while the instance is in not_started or pending_self.
CREATE OR REPLACE FUNCTION public.set_annual_review_template_override(
  p_instance_id uuid,
  p_template_id uuid,           -- NULL clears the override
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status annual_review_status;
  v_prev_override uuid;
  v_seeded_template uuid;
  v_employee uuid;
  v_cycle uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can change an instance template';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 chars)';
  END IF;

  SELECT overall_status, template_override_id, template_id, employee_id, cycle_id
    INTO v_status, v_prev_override, v_seeded_template, v_employee, v_cycle
  FROM public.annual_review_instances
  WHERE id = p_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instance not found';
  END IF;

  IF v_status NOT IN ('not_started', 'pending_self') THEN
    RAISE EXCEPTION 'Template can only be changed before the review starts (current stage: %)', v_status;
  END IF;

  -- Validate the target template exists and is active (when not clearing).
  IF p_template_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.annual_review_templates
      WHERE id = p_template_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Target template is not active or does not exist';
    END IF;
  END IF;

  UPDATE public.annual_review_instances
     SET template_override_id = p_template_id,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.template_override_set',
    v_uid,
    jsonb_build_object(
      'instance_id', p_instance_id,
      'employee_id', v_employee,
      'cycle_id', v_cycle,
      'previous_override_id', v_prev_override,
      'new_override_id', p_template_id,
      'seeded_template_id', v_seeded_template,
      'reason', btrim(p_reason)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_annual_review_template_override(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_annual_review_template_override(uuid, uuid, text) TO authenticated;

-- Annual Review: reopen cycle + mid-cycle reviewer reassignment
-- Additive only. No destructive changes.

-- 1) Reopen audit columns on annual_review_cycles
ALTER TABLE public.annual_review_cycles
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reopened_reason text;

-- 2) Per-instance reviewer reassignment overrides
CREATE TABLE IF NOT EXISTS public.annual_review_assignment_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager','skip_manager','bu_head','hr')),
  new_reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_assignment_overrides TO authenticated;
GRANT ALL ON public.annual_review_assignment_overrides TO service_role;

ALTER TABLE public.annual_review_assignment_overrides ENABLE ROW LEVEL SECURITY;

-- Admins and HR can manage overrides; managers can view overrides on instances they review.
CREATE POLICY "ar_overrides_admin_hr_all"
  ON public.annual_review_assignment_overrides
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE POLICY "ar_overrides_reviewer_select"
  ON public.annual_review_assignment_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.annual_review_instances i
      WHERE i.id = annual_review_assignment_overrides.instance_id
        AND (i.manager_id = auth.uid() OR i.skip_id = auth.uid() OR i.bu_head_id = auth.uid() OR i.hr_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_ar_overrides_instance ON public.annual_review_assignment_overrides(instance_id);

-- 3) RPC: reopen a closed cycle
CREATE OR REPLACE FUNCTION public.reopen_annual_review_cycle(
  p_cycle_id uuid,
  p_reason text
) RETURNS public.annual_review_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle public.annual_review_cycles;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can reopen a cycle.';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;

  UPDATE public.annual_review_cycles
     SET status = 'active',
         reopened_at = now(),
         reopened_by = auth.uid(),
         reopened_reason = p_reason,
         updated_at = now()
   WHERE id = p_cycle_id
     AND status = 'closed'
  RETURNING * INTO v_cycle;

  IF v_cycle.id IS NULL THEN
    RAISE EXCEPTION 'Cycle not found or not in closed state.';
  END IF;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.cycle_reopened',
    auth.uid(),
    jsonb_build_object('cycle_id', p_cycle_id, 'reason', p_reason)
  );

  RETURN v_cycle;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_annual_review_cycle(uuid, text) TO authenticated;

-- 4) RPC: reassign a reviewer mid-cycle
CREATE OR REPLACE FUNCTION public.reassign_annual_review_reviewer(
  p_instance_id uuid,
  p_role text,
  p_new_reviewer_id uuid,
  p_reason text
) RETURNS public.annual_review_assignment_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override public.annual_review_assignment_overrides;
  v_instance public.annual_review_instances;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can reassign reviewers.';
  END IF;
  IF p_role NOT IN ('manager','skip_manager','bu_head','hr') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;

  INSERT INTO public.annual_review_assignment_overrides
    (instance_id, role, new_reviewer_id, reason, created_by)
  VALUES (p_instance_id, p_role, p_new_reviewer_id, p_reason, auth.uid())
  ON CONFLICT (instance_id, role) DO UPDATE
    SET new_reviewer_id = EXCLUDED.new_reviewer_id,
        reason = EXCLUDED.reason,
        created_by = auth.uid(),
        created_at = now()
  RETURNING * INTO v_override;

  -- Also update the snapshotted reviewer on the instance so existing RLS
  -- predicates and queue counts use the new reviewer immediately.
  IF p_role = 'manager' THEN
    UPDATE public.annual_review_instances SET manager_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'skip_manager' THEN
    UPDATE public.annual_review_instances SET skip_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'bu_head' THEN
    UPDATE public.annual_review_instances SET bu_head_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'hr' THEN
    UPDATE public.annual_review_instances SET hr_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  END IF;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.reviewer_reassigned',
    auth.uid(),
    jsonb_build_object(
      'instance_id', p_instance_id,
      'role', p_role,
      'new_reviewer_id', p_new_reviewer_id,
      'reason', p_reason
    )
  );

  RETURN v_override;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_annual_review_reviewer(uuid, text, uuid, text) TO authenticated;
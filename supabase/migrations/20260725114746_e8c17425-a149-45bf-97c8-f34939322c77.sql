-- ============================================================
-- ADR-169 — Reusable "Transfer stage response" for Annual Review
-- ============================================================

CREATE TABLE IF NOT EXISTS public.annual_review_stage_transfer_audit_2026_07 (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id           uuid NOT NULL,
  employee_id           uuid NOT NULL,
  from_role             text NOT NULL,
  to_role               text NOT NULL,
  new_reviewer_id       uuid,
  drop_from_stage       boolean NOT NULL,
  no_op                 boolean NOT NULL DEFAULT false,
  before_enabled_stages jsonb,
  before_status         text,
  before_from_response  jsonb,
  before_to_response    jsonb,
  before_slot_ids       jsonb,
  reason                text NOT NULL,
  actor_id              uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  reverted_at           timestamptz,
  reverted_by           uuid
);

GRANT SELECT ON public.annual_review_stage_transfer_audit_2026_07 TO authenticated;
GRANT ALL    ON public.annual_review_stage_transfer_audit_2026_07 TO service_role;

ALTER TABLE public.annual_review_stage_transfer_audit_2026_07 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stage_transfer_audit_admin_read" ON public.annual_review_stage_transfer_audit_2026_07;
CREATE POLICY "stage_transfer_audit_admin_read"
  ON public.annual_review_stage_transfer_audit_2026_07
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE OR REPLACE FUNCTION public.transfer_annual_review_stage_response(
  p_instance_id     uuid,
  p_from_role       text,
  p_to_role         text,
  p_new_reviewer_id uuid DEFAULT NULL,
  p_drop_from_stage boolean DEFAULT true,
  p_reason          text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inst   public.annual_review_instances;
  v_from_resp public.annual_review_responses;
  v_existing_to public.annual_review_responses;
  v_next_stages jsonb;
  v_new_status public.annual_review_status;
  v_audit_id uuid;
  v_to_reviewer_id uuid;
  v_slot_ids jsonb;
  v_from_pending text;
  v_valid_roles text[] := ARRAY['manager','skip_manager','dept_head','bu_head','hr','management','self'];
BEGIN
  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can transfer stage responses.';
  END IF;
  IF p_from_role IS NULL OR p_to_role IS NULL OR p_from_role = p_to_role THEN
    RAISE EXCEPTION 'from_role and to_role must be provided and different (got % -> %)', p_from_role, p_to_role;
  END IF;
  IF NOT (p_from_role = ANY(v_valid_roles)) OR NOT (p_to_role = ANY(v_valid_roles)) THEN
    RAISE EXCEPTION 'invalid role in (% -> %)', p_from_role, p_to_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_inst.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found: %', p_instance_id;
  END IF;

  v_slot_ids := jsonb_build_object(
    'manager_id',    v_inst.manager_id,
    'skip_id',       v_inst.skip_id,
    'dept_head_id',  v_inst.dept_head_id,
    'bu_head_id',    v_inst.bu_head_id,
    'hr_id',         v_inst.hr_id,
    'management_id', v_inst.management_id
  );

  SELECT * INTO v_from_resp
    FROM public.annual_review_responses
   WHERE instance_id = p_instance_id
     AND reviewer_role = p_from_role::public.annual_reviewer_role
     AND is_locked = true;

  SELECT * INTO v_existing_to
    FROM public.annual_review_responses
   WHERE instance_id = p_instance_id
     AND reviewer_role = p_to_role::public.annual_reviewer_role;

  v_to_reviewer_id := CASE p_to_role
    WHEN 'manager'      THEN v_inst.manager_id
    WHEN 'skip_manager' THEN v_inst.skip_id
    WHEN 'dept_head'    THEN v_inst.dept_head_id
    WHEN 'bu_head'      THEN v_inst.bu_head_id
    WHEN 'hr'           THEN v_inst.hr_id
    WHEN 'management'   THEN v_inst.management_id
    ELSE NULL
  END;

  v_next_stages := COALESCE(v_inst.enabled_stages, '[]'::jsonb);
  IF p_drop_from_stage THEN
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_next_stages
      FROM jsonb_array_elements_text(v_next_stages) x
     WHERE x <> p_from_role;
  END IF;
  IF NOT (v_next_stages ? p_to_role) THEN
    v_next_stages := v_next_stages || to_jsonb(p_to_role);
  END IF;

  INSERT INTO public.annual_review_stage_transfer_audit_2026_07(
    instance_id, employee_id, from_role, to_role, new_reviewer_id, drop_from_stage,
    no_op, before_enabled_stages, before_status,
    before_from_response, before_to_response, before_slot_ids, reason, actor_id
  ) VALUES (
    p_instance_id, v_inst.employee_id, p_from_role, p_to_role, p_new_reviewer_id, p_drop_from_stage,
    (v_from_resp.id IS NULL),
    v_inst.enabled_stages,
    v_inst.overall_status::text,
    CASE WHEN v_from_resp.id IS NULL THEN NULL ELSE to_jsonb(v_from_resp) END,
    CASE WHEN v_existing_to.id IS NULL THEN NULL ELSE to_jsonb(v_existing_to) END,
    v_slot_ids,
    p_reason,
    v_caller
  ) RETURNING id INTO v_audit_id;

  IF v_from_resp.id IS NOT NULL THEN
    IF v_existing_to.id IS NOT NULL THEN
      DELETE FROM public.annual_review_responses WHERE id = v_existing_to.id;
    END IF;
    UPDATE public.annual_review_responses
       SET reviewer_role = p_to_role::public.annual_reviewer_role,
           reviewer_id   = COALESCE(v_to_reviewer_id, reviewer_id),
           updated_at    = now()
     WHERE id = v_from_resp.id;
  END IF;

  IF p_drop_from_stage THEN
    UPDATE public.annual_review_instances
       SET enabled_stages = v_next_stages,
           manager_id     = CASE WHEN p_from_role = 'manager'      THEN p_new_reviewer_id ELSE manager_id END,
           skip_id        = CASE WHEN p_from_role = 'skip_manager' THEN p_new_reviewer_id ELSE skip_id END,
           dept_head_id   = CASE WHEN p_from_role = 'dept_head'    THEN p_new_reviewer_id ELSE dept_head_id END,
           bu_head_id     = CASE WHEN p_from_role = 'bu_head'      THEN p_new_reviewer_id ELSE bu_head_id END,
           hr_id          = CASE WHEN p_from_role = 'hr'           THEN p_new_reviewer_id ELSE hr_id END,
           management_id  = CASE WHEN p_from_role = 'management'   THEN p_new_reviewer_id ELSE management_id END,
           has_admin_workflow_override = true,
           updated_at     = now()
     WHERE id = p_instance_id;
  ELSE
    UPDATE public.annual_review_instances
       SET enabled_stages = v_next_stages,
           manager_id     = CASE WHEN p_from_role = 'manager'      AND p_new_reviewer_id IS NOT NULL THEN p_new_reviewer_id ELSE manager_id END,
           skip_id        = CASE WHEN p_from_role = 'skip_manager' AND p_new_reviewer_id IS NOT NULL THEN p_new_reviewer_id ELSE skip_id END,
           dept_head_id   = CASE WHEN p_from_role = 'dept_head'    AND p_new_reviewer_id IS NOT NULL THEN p_new_reviewer_id ELSE dept_head_id END,
           bu_head_id     = CASE WHEN p_from_role = 'bu_head'      AND p_new_reviewer_id IS NOT NULL THEN p_new_reviewer_id ELSE bu_head_id END,
           hr_id          = CASE WHEN p_from_role = 'hr'           AND p_new_reviewer_id IS NOT NULL THEN p_new_reviewer_id ELSE hr_id END,
           management_id  = CASE WHEN p_from_role = 'management'   AND p_new_reviewer_id IS NOT NULL THEN p_new_reviewer_id ELSE management_id END,
           has_admin_workflow_override = true,
           updated_at     = now()
     WHERE id = p_instance_id;
  END IF;

  v_from_pending := 'pending_' || CASE p_from_role
    WHEN 'dept_head'    THEN 'dept'
    WHEN 'bu_head'      THEN 'bu'
    WHEN 'skip_manager' THEN 'skip'
    ELSE p_from_role
  END;

  IF v_inst.overall_status::text = v_from_pending THEN
    SELECT CASE lower(s)
             WHEN 'self'         THEN 'pending_self'::public.annual_review_status
             WHEN 'manager'      THEN 'pending_manager'::public.annual_review_status
             WHEN 'skip_manager' THEN 'pending_skip'::public.annual_review_status
             WHEN 'dept_head'    THEN 'pending_dept'::public.annual_review_status
             WHEN 'bu_head'      THEN 'pending_bu'::public.annual_review_status
             WHEN 'hr'           THEN 'pending_hr'::public.annual_review_status
             WHEN 'management'   THEN 'pending_management'::public.annual_review_status
           END
      INTO v_new_status
      FROM jsonb_array_elements_text(v_next_stages) s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.annual_review_responses r
        WHERE r.instance_id = p_instance_id
          AND r.reviewer_role::text = s
          AND r.is_locked = true
     )
     LIMIT 1;

    UPDATE public.annual_review_instances
       SET overall_status = COALESCE(v_new_status, 'completed'::public.annual_review_status),
           updated_at = now()
     WHERE id = p_instance_id;
  END IF;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    'annual_review.stage_response_transferred',
    v_caller,
    jsonb_build_object(
      'instance_id', p_instance_id,
      'from_role', p_from_role,
      'to_role',   p_to_role,
      'new_reviewer_id', p_new_reviewer_id,
      'drop_from_stage', p_drop_from_stage,
      'audit_id',  v_audit_id,
      'no_op',     (v_from_resp.id IS NULL),
      'reason',    p_reason
    )
  );

  RETURN v_audit_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.transfer_annual_review_stage_response(uuid,text,text,uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revert_stage_transfer(p_audit_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_a public.annual_review_stage_transfer_audit_2026_07;
BEGIN
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Only admin can revert a stage transfer.';
  END IF;

  SELECT * INTO v_a FROM public.annual_review_stage_transfer_audit_2026_07 WHERE id = p_audit_id FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Audit row not found.'; END IF;
  IF v_a.reverted_at IS NOT NULL THEN RAISE EXCEPTION 'Already reverted.'; END IF;

  UPDATE public.annual_review_instances
     SET enabled_stages = v_a.before_enabled_stages,
         overall_status = v_a.before_status::public.annual_review_status,
         manager_id     = (v_a.before_slot_ids->>'manager_id')::uuid,
         skip_id        = (v_a.before_slot_ids->>'skip_id')::uuid,
         dept_head_id   = (v_a.before_slot_ids->>'dept_head_id')::uuid,
         bu_head_id     = (v_a.before_slot_ids->>'bu_head_id')::uuid,
         hr_id          = (v_a.before_slot_ids->>'hr_id')::uuid,
         management_id  = (v_a.before_slot_ids->>'management_id')::uuid,
         updated_at = now()
   WHERE id = v_a.instance_id;

  DELETE FROM public.annual_review_responses
   WHERE instance_id = v_a.instance_id
     AND reviewer_role::text IN (v_a.from_role, v_a.to_role);

  IF v_a.before_from_response IS NOT NULL THEN
    INSERT INTO public.annual_review_responses
    SELECT * FROM jsonb_populate_record(NULL::public.annual_review_responses, v_a.before_from_response);
  END IF;
  IF v_a.before_to_response IS NOT NULL THEN
    INSERT INTO public.annual_review_responses
    SELECT * FROM jsonb_populate_record(NULL::public.annual_review_responses, v_a.before_to_response);
  END IF;

  UPDATE public.annual_review_stage_transfer_audit_2026_07
     SET reverted_at = now(), reverted_by = v_caller
   WHERE id = p_audit_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.stage_transfer_reverted', v_caller,
          jsonb_build_object('audit_id', p_audit_id, 'instance_id', v_a.instance_id));
END; $$;

GRANT EXECUTE ON FUNCTION public.revert_stage_transfer(uuid) TO authenticated;

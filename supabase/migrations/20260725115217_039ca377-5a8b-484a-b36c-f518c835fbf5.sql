DO $$
DECLARE
  v_cycle uuid;
  v_umesh uuid := '455f85a8-c345-4938-a77f-00598719e0ae';
  v_bijay uuid := 'a58ce3a2-7520-40c9-99d8-7c4415ae31c8';
  r record;
  v_resp public.annual_review_responses;
  v_slot_ids jsonb;
  v_next_stages jsonb;
BEGIN
  SELECT id INTO v_cycle FROM public.annual_review_cycles
    WHERE status = 'active' ORDER BY review_year DESC LIMIT 1;
  IF v_cycle IS NULL THEN RAISE EXCEPTION 'No active cycle'; END IF;

  FOR r IN
    SELECT ari.*
      FROM public.annual_review_instances ari
     WHERE ari.cycle_id = v_cycle
       AND ari.bu_head_id = v_umesh
       AND EXISTS (
         SELECT 1 FROM public.annual_review_responses rr
          WHERE rr.instance_id = ari.id
            AND rr.reviewer_role = 'bu_head'
            AND rr.is_locked = true
       )
  LOOP
    SELECT * INTO v_resp FROM public.annual_review_responses
     WHERE instance_id = r.id AND reviewer_role = 'bu_head' AND is_locked = true;

    v_slot_ids := jsonb_build_object(
      'manager_id', r.manager_id, 'skip_id', r.skip_id,
      'dept_head_id', r.dept_head_id, 'bu_head_id', r.bu_head_id,
      'hr_id', r.hr_id, 'management_id', r.management_id
    );

    v_next_stages := COALESCE(r.enabled_stages, '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_next_stages
      FROM jsonb_array_elements_text(v_next_stages) x WHERE x <> 'bu_head';
    IF NOT (v_next_stages ? 'dept_head') THEN
      v_next_stages := v_next_stages || to_jsonb('dept_head'::text);
    END IF;

    INSERT INTO public.annual_review_stage_transfer_audit_2026_07(
      instance_id, employee_id, from_role, to_role, new_reviewer_id, drop_from_stage,
      no_op, before_enabled_stages, before_status,
      before_from_response, before_to_response, before_slot_ids, reason, actor_id
    ) VALUES (
      r.id, r.employee_id, 'bu_head', 'dept_head', v_bijay, true,
      false, r.enabled_stages, r.overall_status::text,
      to_jsonb(v_resp), NULL, v_slot_ids,
      'ADR-169 one-off: Umesh (100600) BU->Dept, Bijay (101906) new BU Head of Facility Mgmt',
      NULL
    );

    DELETE FROM public.annual_review_responses
     WHERE instance_id = r.id AND reviewer_role = 'dept_head';

    UPDATE public.annual_review_responses
       SET reviewer_role = 'dept_head'::public.annual_reviewer_role,
           reviewer_id = v_umesh,
           updated_at = now()
     WHERE id = v_resp.id;

    UPDATE public.annual_review_instances
       SET enabled_stages = v_next_stages,
           bu_head_id = v_bijay,
           dept_head_id = v_umesh,
           has_admin_workflow_override = true,
           updated_at = now()
     WHERE id = r.id;
  END LOOP;

  UPDATE public.annual_review_instances
     SET bu_head_id = v_bijay,
         has_admin_workflow_override = true,
         updated_at = now()
   WHERE cycle_id = v_cycle
     AND bu_head_id = v_umesh;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.bu_head_reassigned_org_change', NULL,
          jsonb_build_object(
            'from_user', v_umesh, 'to_user', v_bijay,
            'cycle_id', v_cycle, 'note', 'ADR-169 one-off application; BU master left for admin UI'
          ));
END $$;
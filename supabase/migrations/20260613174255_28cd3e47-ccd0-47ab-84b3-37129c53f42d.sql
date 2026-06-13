-- 1) Close an annual review cycle. Locks every response, marks cycle closed.
CREATE OR REPLACE FUNCTION public.close_annual_review_cycle(p_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_locked integer := 0;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may close annual review cycles';
  END IF;

  UPDATE public.annual_review_responses r
     SET is_locked = true
    FROM public.annual_review_instances i
   WHERE r.instance_id = i.id AND i.cycle_id = p_cycle_id AND r.is_locked = false;
  GET DIAGNOSTICS v_locked = ROW_COUNT;

  UPDATE public.annual_review_cycles
     SET status = 'closed', updated_at = now()
   WHERE id = p_cycle_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.cycle_closed', v_caller,
          jsonb_build_object('cycle_id', p_cycle_id, 'responses_locked', v_locked));

  RETURN v_locked;
END $$;

GRANT EXECUTE ON FUNCTION public.close_annual_review_cycle(uuid) TO authenticated;

-- 2) Guard trigger: when a cycle is closed, block writes to its instances/responses
CREATE OR REPLACE FUNCTION public.block_when_annual_cycle_closed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_status text;
  v_caller uuid := auth.uid();
BEGIN
  -- Allow admins to still patch closed cycles (e.g. rating overrides).
  IF v_caller IS NOT NULL AND (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'annual_review_instances' THEN
    v_cycle_id := COALESCE(NEW.cycle_id, OLD.cycle_id);
  ELSE
    SELECT cycle_id INTO v_cycle_id
      FROM public.annual_review_instances
     WHERE id = COALESCE(NEW.instance_id, OLD.instance_id);
  END IF;

  SELECT status INTO v_status FROM public.annual_review_cycles WHERE id = v_cycle_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'cycle % is closed — no further edits allowed', v_cycle_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_closed_cycle_instances ON public.annual_review_instances;
CREATE TRIGGER trg_block_closed_cycle_instances
BEFORE UPDATE OR DELETE ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.block_when_annual_cycle_closed();

DROP TRIGGER IF EXISTS trg_block_closed_cycle_responses ON public.annual_review_responses;
CREATE TRIGGER trg_block_closed_cycle_responses
BEFORE INSERT OR UPDATE OR DELETE ON public.annual_review_responses
FOR EACH ROW EXECUTE FUNCTION public.block_when_annual_cycle_closed();

-- 3) Rating override (calibration) for already-finalized instances
CREATE OR REPLACE FUNCTION public.override_annual_review_rating(
  p_instance_id uuid,
  p_new_rating  text,
  p_reason      text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_prev   text;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may override annual review ratings';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'a non-empty reason is required for rating overrides';
  END IF;

  SELECT final_rating INTO v_prev FROM public.annual_review_instances WHERE id = p_instance_id;

  UPDATE public.annual_review_instances
     SET final_rating = p_new_rating, updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.rating_override', v_caller, jsonb_build_object(
    'instance_id', p_instance_id, 'from', v_prev, 'to', p_new_rating, 'reason', p_reason
  ));
END $$;

GRANT EXECUTE ON FUNCTION public.override_annual_review_rating(uuid, text, text) TO authenticated;

-- 4) Pending-reviewer reminder helper, used by daily cron / edge function
CREATE OR REPLACE FUNCTION public.list_annual_review_pending_reviewers(p_cycle_id uuid)
RETURNS TABLE(
  instance_id uuid,
  cycle_id    uuid,
  cycle_name  text,
  employee_id uuid,
  employee_name text,
  stage       text,
  reviewer_id uuid,
  deadline    date,
  days_to_deadline integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, c.id, c.name,
         i.employee_id,
         e.full_name,
         i.overall_status::text,
         CASE i.overall_status
           WHEN 'pending_self'    THEN i.employee_id
           WHEN 'pending_manager' THEN i.manager_id
           WHEN 'pending_skip'    THEN i.skip_id
           WHEN 'pending_bu'      THEN i.bu_head_id
           WHEN 'pending_hr'      THEN i.hr_id
         END,
         CASE i.overall_status
           WHEN 'pending_self'    THEN c.self_review_end
           WHEN 'pending_manager' THEN c.manager_review_end
           WHEN 'pending_skip'    THEN c.skip_review_end
           WHEN 'pending_bu'      THEN c.bu_review_end
           WHEN 'pending_hr'      THEN c.hr_finalization_deadline
         END,
         (CASE i.overall_status
           WHEN 'pending_self'    THEN c.self_review_end
           WHEN 'pending_manager' THEN c.manager_review_end
           WHEN 'pending_skip'    THEN c.skip_review_end
           WHEN 'pending_bu'      THEN c.bu_review_end
           WHEN 'pending_hr'      THEN c.hr_finalization_deadline
         END - CURRENT_DATE)::integer
  FROM public.annual_review_instances i
  JOIN public.annual_review_cycles c ON c.id = i.cycle_id
  JOIN public.profiles e ON e.id = i.employee_id
  WHERE i.cycle_id = p_cycle_id
    AND i.overall_status::text LIKE 'pending_%'
    AND c.status = 'active';
$$;

GRANT EXECUTE ON FUNCTION public.list_annual_review_pending_reviewers(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.close_annual_review_cycle IS
  'Marks an annual review cycle as closed and locks all responses. Closed cycles cannot be edited by non-admin roles.';
COMMENT ON FUNCTION public.override_annual_review_rating IS
  'HR/Admin-only override of an annual review final_rating with a mandatory reason. Audit-logged.';
COMMENT ON FUNCTION public.list_annual_review_pending_reviewers IS
  'Returns the active reviewer + deadline per pending instance for the daily reminder cron.';
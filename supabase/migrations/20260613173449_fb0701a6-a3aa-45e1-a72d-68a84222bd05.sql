CREATE OR REPLACE FUNCTION public.notify_annual_review_stage_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recipient uuid;
  v_title text;
  v_msg   text;
  v_emp_name text;
  v_cycle_name text;
BEGIN
  IF NEW.overall_status IS NOT DISTINCT FROM OLD.overall_status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_emp_name FROM public.profiles WHERE id = NEW.employee_id;
  SELECT name      INTO v_cycle_name FROM public.annual_review_cycles WHERE id = NEW.cycle_id;

  v_recipient := CASE NEW.overall_status
    WHEN 'pending_self'    THEN NEW.employee_id
    WHEN 'pending_manager' THEN NEW.manager_id
    WHEN 'pending_skip'    THEN NEW.skip_id
    WHEN 'pending_bu'      THEN NEW.bu_head_id
    WHEN 'pending_hr'      THEN NEW.hr_id
    WHEN 'completed'       THEN NEW.employee_id
    ELSE NULL
  END;

  IF v_recipient IS NULL THEN RETURN NEW; END IF;

  IF NEW.overall_status = 'completed' THEN
    v_title := 'Annual review finalized';
    v_msg   := format('Your %s review has been finalized.', COALESCE(v_cycle_name, 'annual'));
  ELSIF NEW.overall_status = 'pending_self' AND OLD.overall_status IS NOT NULL THEN
    v_title := 'Annual review returned for revision';
    v_msg   := format('Your %s self-review was returned. Please revise and resubmit.', COALESCE(v_cycle_name, 'annual'));
  ELSE
    v_title := 'Annual review awaiting your action';
    v_msg   := format('%s — %s', COALESCE(v_emp_name, 'Employee'), COALESCE(v_cycle_name, 'annual review'));
  END IF;

  INSERT INTO public.notifications(user_id, type, title, message, metadata)
  VALUES (
    v_recipient,
    'annual_review_stage',
    v_title,
    v_msg,
    jsonb_build_object(
      'instance_id', NEW.id,
      'cycle_id', NEW.cycle_id,
      'employee_id', NEW.employee_id,
      'from_status', OLD.overall_status,
      'to_status', NEW.overall_status
    )
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_annual_review_stage_notify ON public.annual_review_instances;
CREATE TRIGGER trg_annual_review_stage_notify
AFTER UPDATE OF overall_status ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.notify_annual_review_stage_change();

COMMENT ON FUNCTION public.notify_annual_review_stage_change IS
  'Inserts in-app notifications for the next reviewer (or the employee on completion / send-back to self) whenever overall_status transitions on annual_review_instances.';

CREATE OR REPLACE FUNCTION public.bulk_finalize_annual_reviews(
  p_instance_ids uuid[],
  p_final_rating text,
  p_hr_remarks   text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_count  integer := 0;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may bulk-finalize annual reviews';
  END IF;

  UPDATE public.annual_review_instances
     SET final_rating  = p_final_rating,
         hr_remarks    = COALESCE(p_hr_remarks, hr_remarks),
         finalized_at  = now(),
         finalized_by  = v_caller,
         overall_status = 'completed',
         updated_at    = now()
   WHERE id = ANY(p_instance_ids)
     AND overall_status = 'pending_hr';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.bulk_finalize', v_caller, jsonb_build_object(
    'count', v_count, 'rating', p_final_rating, 'instance_ids', p_instance_ids
  ));

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.bulk_finalize_annual_reviews(uuid[], text, text) TO authenticated;

COMMENT ON FUNCTION public.bulk_finalize_annual_reviews IS
  'Bulk-applies the same final_rating and HR remark to multiple pending_hr annual_review_instances. Restricted to admin / hr_pms.';
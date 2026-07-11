CREATE OR REPLACE FUNCTION public.notify_annual_review_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHEN 'pending_dept'    THEN NEW.dept_head_id
    WHEN 'pending_bu'      THEN NEW.bu_head_id
    WHEN 'pending_hr'      THEN NEW.hr_id
    WHEN 'completed'       THEN NEW.employee_id
    ELSE NULL
  END;

  IF v_recipient IS NULL THEN RETURN NEW; END IF;

  -- Skip silently for non-login recipients (present only in public.profiles,
  -- not auth.users). Without this guard, notifications_user_id_fkey aborts
  -- the whole transaction (e.g. bulk send-back), even though the review
  -- state change itself is valid.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_recipient) THEN
    RETURN NEW;
  END IF;

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

  BEGIN
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
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE LOG 'notify_annual_review_stage_change: skipped notification for recipient % (fk violation)', v_recipient;
  END;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.notify_on_kpi_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_employee_name TEXT;
  v_rollover_batch TEXT;
BEGIN
  -- Check if this insert is part of a rollover batch; if so, skip per-KPI notification
  v_rollover_batch := current_setting('app.rollover_batch', true);
  IF v_rollover_batch = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.employee_id;

  -- Skip notification for non-login users (no auth.users row). Best-effort dispatch.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.employee_id) THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, metadata)
      VALUES (
        NEW.employee_id,
        'kra_assigned',
        'New KRA Assigned',
        'A new KPI has been assigned to you: ' || NEW.kpi_name,
        NEW.id,
        jsonb_build_object(
          'kra_name', NEW.kra_name,
          'kpi_name', NEW.kpi_name,
          'review_period', NEW.review_period,
          'review_year', NEW.review_year
        )
      );
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_observation_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kpi_owner uuid;
  v_observer_name text;
  v_kpi_name text;
  v_resolver_id uuid;
BEGIN
  SELECT k.employee_id, k.kpi_name INTO v_kpi_owner, v_kpi_name
  FROM kpis k WHERE k.id = NEW.kpi_id;

  SELECT COALESCE(p.full_name, p.email) INTO v_observer_name
  FROM profiles p WHERE p.id = NEW.created_by;

  IF TG_OP = 'INSERT' THEN
    IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.created_by THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_kpi_owner, 'observation_raised',
        'New Observation on ' || v_kpi_name,
        v_observer_name || ' raised a ' || NEW.observation_type || ' observation: ' || NEW.title,
        NEW.kpi_id, NEW.created_by,
        jsonb_build_object(
          'observation_id', NEW.id,
          'observation_title', NEW.title,
          'observation_type', NEW.observation_type,
          'observation_description', NEW.description,
          'employee_id', v_kpi_owner
        ));
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'resolved' AND NEW.status = 'resolved' THEN
    v_resolver_id := COALESCE(auth.uid(), NEW.created_by);

    IF v_kpi_owner IS NOT NULL AND v_kpi_owner != v_resolver_id THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_kpi_owner, 'observation_resolved',
        'Observation Resolved on ' || v_kpi_name,
        'Observation "' || NEW.title || '" has been resolved',
        NEW.kpi_id, v_resolver_id,
        jsonb_build_object(
          'observation_id', NEW.id,
          'observation_title', NEW.title,
          'observation_type', NEW.observation_type,
          'observation_description', NEW.description,
          'employee_id', v_kpi_owner
        ));
    END IF;

    IF NEW.created_by != v_resolver_id AND (v_kpi_owner IS NULL OR NEW.created_by != v_kpi_owner) THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (NEW.created_by, 'observation_resolved',
        'Observation Resolved on ' || v_kpi_name,
        'Observation "' || NEW.title || '" has been resolved',
        NEW.kpi_id, v_resolver_id,
        jsonb_build_object(
          'observation_id', NEW.id,
          'observation_title', NEW.title,
          'observation_type', NEW.observation_type,
          'observation_description', NEW.description,
          'employee_id', v_kpi_owner
        ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
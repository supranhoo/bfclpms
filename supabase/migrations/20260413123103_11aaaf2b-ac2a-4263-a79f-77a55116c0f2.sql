CREATE OR REPLACE FUNCTION public.notify_on_observation_reply()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_obs_creator uuid;
  v_kpi_id uuid;
  v_kpi_owner uuid;
  v_kpi_name text;
  v_replier_name text;
  v_obs_title text;
  v_reply_content text;
  v_obs_type text;
  v_obs_description text;
BEGIN
  v_reply_content := NEW.reply_text;

  SELECT o.created_by, o.kpi_id, o.title, o.observation_type::text, o.description
  INTO v_obs_creator, v_kpi_id, v_obs_title, v_obs_type, v_obs_description
  FROM kpi_observations o WHERE o.id = NEW.observation_id;

  SELECT k.employee_id, k.kpi_name INTO v_kpi_owner, v_kpi_name
  FROM kpis k WHERE k.id = v_kpi_id;

  v_kpi_name := LEFT(SPLIT_PART(v_kpi_name, E'\n', 1), 80);

  SELECT COALESCE(p.full_name, p.email) INTO v_replier_name
  FROM profiles p WHERE p.id = NEW.reply_by;

  IF v_obs_creator IS NOT NULL AND v_obs_creator != NEW.reply_by THEN
    INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (v_obs_creator, 'observation_reply',
      'New Reply on Observation',
      v_replier_name || ' replied to observation "' || v_obs_title || '" on ' || v_kpi_name,
      v_kpi_id, NEW.reply_by,
      jsonb_build_object(
        'observation_id', NEW.observation_id,
        'reply_id', NEW.id,
        'observation_title', v_obs_title,
        'reply_content', v_reply_content,
        'observation_type', v_obs_type,
        'observation_description', v_obs_description,
        'employee_id', v_kpi_owner
      ));
  END IF;

  IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.reply_by AND v_kpi_owner != v_obs_creator THEN
    INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (v_kpi_owner, 'observation_reply',
      'New Reply on Observation',
      v_replier_name || ' replied to observation "' || v_obs_title || '" on ' || v_kpi_name,
      v_kpi_id, NEW.reply_by,
      jsonb_build_object(
        'observation_id', NEW.observation_id,
        'reply_id', NEW.id,
        'observation_title', v_obs_title,
        'reply_content', v_reply_content,
        'observation_type', v_obs_type,
        'observation_description', v_obs_description,
        'employee_id', v_kpi_owner
      ));
  END IF;

  RETURN NEW;
END;
$function$;
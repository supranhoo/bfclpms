
-- ============================================================
-- Trigger function: notify on observation INSERT or resolved UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_observation_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_kpi_owner uuid;
  v_observer_name text;
  v_kpi_name text;
  v_resolver_id uuid;
BEGIN
  -- Get KPI owner and name
  SELECT k.employee_id, k.kpi_name INTO v_kpi_owner, v_kpi_name
  FROM kpis k WHERE k.id = NEW.kpi_id;

  SELECT COALESCE(p.full_name, p.email) INTO v_observer_name
  FROM profiles p WHERE p.id = NEW.created_by;

  IF TG_OP = 'INSERT' THEN
    -- New observation: notify KPI owner
    IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.created_by THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_kpi_owner, 'observation_raised',
        'New Observation on ' || v_kpi_name,
        v_observer_name || ' raised a ' || NEW.observation_type || ' observation: ' || NEW.title,
        NEW.kpi_id, NEW.created_by,
        jsonb_build_object('observation_id', NEW.id));
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'resolved' AND NEW.status = 'resolved' THEN
    v_resolver_id := COALESCE(auth.uid(), NEW.created_by);

    -- Notify KPI owner (if not the resolver)
    IF v_kpi_owner IS NOT NULL AND v_kpi_owner != v_resolver_id THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_kpi_owner, 'observation_resolved',
        'Observation Resolved on ' || v_kpi_name,
        'Observation "' || NEW.title || '" has been resolved',
        NEW.kpi_id, v_resolver_id,
        jsonb_build_object('observation_id', NEW.id));
    END IF;

    -- Notify observation creator (if different from both resolver and KPI owner)
    IF NEW.created_by != v_resolver_id AND (v_kpi_owner IS NULL OR NEW.created_by != v_kpi_owner) THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (NEW.created_by, 'observation_resolved',
        'Observation Resolved on ' || v_kpi_name,
        'Observation "' || NEW.title || '" has been resolved',
        NEW.kpi_id, v_resolver_id,
        jsonb_build_object('observation_id', NEW.id));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on kpi_observations
CREATE TRIGGER trg_notify_observation_change
AFTER INSERT OR UPDATE ON public.kpi_observations
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_observation_change();

-- ============================================================
-- Trigger function: notify on observation reply INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_observation_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_obs_creator uuid;
  v_kpi_id uuid;
  v_kpi_owner uuid;
  v_kpi_name text;
  v_replier_name text;
  v_obs_title text;
BEGIN
  SELECT o.created_by, o.kpi_id, o.title INTO v_obs_creator, v_kpi_id, v_obs_title
  FROM kpi_observations o WHERE o.id = NEW.observation_id;

  SELECT k.employee_id, k.kpi_name INTO v_kpi_owner, v_kpi_name
  FROM kpis k WHERE k.id = v_kpi_id;

  SELECT COALESCE(p.full_name, p.email) INTO v_replier_name
  FROM profiles p WHERE p.id = NEW.reply_by;

  -- Notify observation creator (if not the replier)
  IF v_obs_creator IS NOT NULL AND v_obs_creator != NEW.reply_by THEN
    INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (v_obs_creator, 'observation_reply',
      'New Reply on Observation',
      v_replier_name || ' replied to observation "' || v_obs_title || '" on ' || v_kpi_name,
      v_kpi_id, NEW.reply_by,
      jsonb_build_object('observation_id', NEW.observation_id, 'reply_id', NEW.id));
  END IF;

  -- Notify KPI owner (if different from both replier and obs creator)
  IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.reply_by AND v_kpi_owner != v_obs_creator THEN
    INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (v_kpi_owner, 'observation_reply',
      'New Reply on Observation',
      v_replier_name || ' replied to observation "' || v_obs_title || '" on ' || v_kpi_name,
      v_kpi_id, NEW.reply_by,
      jsonb_build_object('observation_id', NEW.observation_id, 'reply_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on kpi_observation_replies
CREATE TRIGGER trg_notify_observation_reply
AFTER INSERT ON public.kpi_observation_replies
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_observation_reply();

-- ============================================================
-- Update email notification mapping to include observation types
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_email_on_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  recipient_email TEXT;
  recipient_name TEXT;
  kpi_record RECORD;
  actor_name TEXT;
  supabase_url TEXT;
  service_role_key TEXT;
  mapped_event_type TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://jdvsvqiyptijplyhmqqn.supabase.co';
  END IF;
  
  SELECT p.email, p.full_name INTO recipient_email, recipient_name
  FROM profiles p WHERE p.id = NEW.user_id;
  
  IF recipient_email IS NULL THEN RETURN NEW; END IF;
  
  IF NEW.related_user_id IS NOT NULL THEN
    SELECT p.full_name INTO actor_name FROM profiles p WHERE p.id = NEW.related_user_id;
  END IF;
  
  IF NEW.kpi_id IS NOT NULL THEN
    SELECT k.kra_name, k.kpi_name, k.review_period, k.review_year
    INTO kpi_record FROM kpis k WHERE k.id = NEW.kpi_id;
  END IF;
  
  CASE NEW.type
    WHEN 'kpi_approved' THEN
      IF NEW.metadata->>'stage' = 'auditor' THEN
        mapped_event_type := 'manager_approved';
      ELSE
        mapped_event_type := 'manager_approved';
      END IF;
    WHEN 'kpi_finalized' THEN mapped_event_type := 'final_approved';
    WHEN 'kpi_ready_for_audit' THEN mapped_event_type := 'kpi_ready_for_audit';
    WHEN 'kpi_ready_for_management' THEN mapped_event_type := 'kpi_ready_for_management';
    WHEN 'query_response_submitted' THEN mapped_event_type := 'query_response_received';
    WHEN 'query_response_fyi' THEN mapped_event_type := 'query_response_received';
    WHEN 'query_resolved_fyi' THEN mapped_event_type := 'query_resolved';
    WHEN 'admin_status_change' THEN mapped_event_type := 'admin_status_change';
    WHEN 'admin_data_entry' THEN mapped_event_type := 'admin_data_entry';
    WHEN 'admin_data_override' THEN mapped_event_type := 'admin_data_override';
    WHEN 'org_kpi_sent_back' THEN mapped_event_type := 'org_kpi_sent_back';
    WHEN 'observation_raised' THEN mapped_event_type := 'observation_raised';
    WHEN 'observation_reply' THEN mapped_event_type := 'observation_reply';
    WHEN 'observation_resolved' THEN mapped_event_type := 'observation_resolved';
    ELSE mapped_event_type := NEW.type;
  END CASE;
  
  PERFORM extensions.http_post(
    url := supabase_url || '/functions/v1/send-email-notification',
    body := jsonb_build_object(
      'event_type', mapped_event_type,
      'recipient_email', recipient_email,
      'recipient_name', COALESCE(recipient_name, 'User'),
      'kpi_name', kpi_record.kpi_name,
      'kra_name', kpi_record.kra_name,
      'actor_name', actor_name,
      'review_period', kpi_record.review_period,
      'review_year', kpi_record.review_year,
      'query_reason', NEW.metadata->>'query_reason',
      'resolution_notes', NEW.metadata->>'resolution_notes',
      'pip_start_date', NEW.metadata->>'pip_start_date',
      'pip_end_date', NEW.metadata->>'pip_end_date',
      'pip_reason', NEW.metadata->>'pip_reason',
      'pip_outcome', NEW.metadata->>'pip_outcome',
      'pip_remarks', NEW.metadata->>'pip_remarks',
      'milestone_date', NEW.metadata->>'milestone_date',
      'milestone_description', NEW.metadata->>'milestone_description',
      'milestone_expected_outcome', NEW.metadata->>'milestone_expected_outcome',
      'send_back_reason', NEW.metadata->>'send_back_reason'
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.jwt.claim.sub', true))
    )::jsonb
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

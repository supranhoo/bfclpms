
CREATE OR REPLACE FUNCTION public.send_email_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  supabase_url TEXT;
  anon_key TEXT;
  recipient_email TEXT;
  recipient_name TEXT;
  actor_name TEXT;
  mapped_event_type TEXT;
  kpi_record RECORD;
  v_kpi_name TEXT;
BEGIN
  -- Skip kra_rollover notifications — the rollover edge function sends its own consolidated email
  IF NEW.type = 'kra_rollover' THEN
    RETURN NEW;
  END IF;

  supabase_url := current_setting('app.settings.supabase_url', true);
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := 'https://jdvsvqiyptijplyhmqqn.supabase.co';
  END IF;
  
  SELECT setting_value #>> '{}' INTO anon_key
  FROM system_settings
  WHERE setting_key = 'supabase_anon_key';
  
  IF anon_key IS NULL OR anon_key = '' THEN
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4';
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

  v_kpi_name := kpi_record.kpi_name;
  -- Truncate KPI name to first line for observation AND query notification types
  IF NEW.type IN (
    'observation_raised', 'observation_reply', 'observation_resolved', 'observation_mention',
    'query_raised', 'query_response_submitted', 'query_response_fyi', 'query_resolved', 'query_resolved_fyi'
  ) THEN
    v_kpi_name := LEFT(SPLIT_PART(COALESCE(v_kpi_name, ''), E'\n', 1), 80);
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
    WHEN 'observation_mention' THEN mapped_event_type := 'observation_mention';
    WHEN 'admin_status_step_back' THEN mapped_event_type := 'admin_status_step_back';
    WHEN 'rollback_requested' THEN mapped_event_type := 'rollback_requested';
    WHEN 'rollback_approved' THEN mapped_event_type := 'rollback_approved';
    WHEN 'rollback_rejected' THEN mapped_event_type := 'rollback_rejected';
    ELSE mapped_event_type := NEW.type;
  END CASE;
  
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-email-notification',
    body := jsonb_build_object(
      'event_type', mapped_event_type,
      'recipient_email', recipient_email,
      'recipient_name', COALESCE(recipient_name, 'User'),
      'kpi_name', v_kpi_name,
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
      'send_back_reason', NEW.metadata->>'send_back_reason',
      'observation_title', NEW.metadata->>'observation_title',
      'observation_type', NEW.metadata->>'observation_type',
      'observation_description', NEW.metadata->>'observation_description',
      'reply_content', NEW.metadata->>'reply_content',
      'final_score', NEW.metadata->>'final_score',
      'employee_name', NEW.metadata->>'employee_name'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key
    )
  );
  
  RETURN NEW;
END;
$$;

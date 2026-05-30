-- Phase 17 — Retry v2 hardening for employee incident report submission.
-- Normalize reporter_id server-side so stale/offline browser payloads cannot
-- violate the reporter identity check. No schema or downstream permission change.

CREATE OR REPLACE FUNCTION public.safety_incident_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ack int;
  v_close int;
  v_auth_user uuid;
BEGIN
  v_auth_user := auth.uid();

  IF v_auth_user IS NOT NULL THEN
    NEW.reporter_id := v_auth_user;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('safety_incident_number'));
  IF NEW.incident_number IS NULL THEN
    NEW.incident_number := 'INC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.safety_incident_number_seq')::text, 6, '0');
  END IF;

  SELECT acknowledge_hours, close_hours INTO v_ack, v_close
    FROM public.safety_severity_sla WHERE severity = NEW.severity;

  IF NEW.acknowledge_due_at IS NULL THEN
    NEW.acknowledge_due_at := COALESCE(NEW.created_at, now()) + (v_ack || ' hours')::interval;
  END IF;
  IF NEW.close_due_at IS NULL THEN
    NEW.close_due_at := COALESCE(NEW.created_at, now()) + (v_close || ' hours')::interval;
  END IF;
  RETURN NEW;
END;
$$;
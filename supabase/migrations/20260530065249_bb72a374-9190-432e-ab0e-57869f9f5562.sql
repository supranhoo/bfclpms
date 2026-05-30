
-- Phase 18: Server-authoritative safety incident submission entrypoint.
-- Eliminates intermittent RLS 42501 failures on the direct browser insert path
-- by stamping reporter_id from auth.uid() inside a SECURITY DEFINER RPC.

CREATE OR REPLACE FUNCTION public.report_safety_incident(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_csid text;
  v_existing record;
  v_new record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_csid := NULLIF(p_payload->>'client_submission_id', '');
  IF v_csid IS NULL THEN
    RAISE EXCEPTION 'client_submission_id_required' USING ERRCODE = '22023';
  END IF;

  -- Idempotent retry: if a row already exists for this submission id, return it.
  SELECT id, incident_number
    INTO v_existing
    FROM public.safety_incidents
   WHERE reporter_id = v_uid
     AND client_submission_id = v_csid
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'incident_number', v_existing.incident_number,
      'reused', true
    );
  END IF;

  INSERT INTO public.safety_incidents (
    reporter_id,
    client_submission_id,
    title,
    description,
    location,
    incident_type,
    severity,
    business_unit_id,
    department_id,
    involved_person_id,
    involved_person_name,
    occurred_at
  )
  VALUES (
    v_uid, -- server-stamped, NEVER trusted from client
    v_csid,
    NULLIF(p_payload->>'title', ''),
    NULLIF(p_payload->>'description', ''),
    NULLIF(p_payload->>'location', ''),
    (p_payload->>'incident_type')::safety_incident_type,
    (p_payload->>'severity')::safety_incident_severity,
    NULLIF(p_payload->>'business_unit_id', '')::uuid,
    NULLIF(p_payload->>'department_id', '')::uuid,
    NULLIF(p_payload->>'involved_person_id', '')::uuid,
    NULLIF(p_payload->>'involved_person_name', ''),
    COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, now())
  )
  RETURNING id, incident_number INTO v_new;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'incident_number', v_new.incident_number,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_safety_incident(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_safety_incident(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.report_safety_incident(jsonb) TO authenticated;

COMMENT ON FUNCTION public.report_safety_incident(jsonb) IS
  'Phase 18: server-authoritative safety incident submission. reporter_id is stamped from auth.uid(); never trusts client. Idempotent on (reporter_id, client_submission_id).';

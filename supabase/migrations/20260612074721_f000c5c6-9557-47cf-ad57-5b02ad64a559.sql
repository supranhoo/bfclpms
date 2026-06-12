-- Phase 3: Evidence display-name rename
ALTER TABLE public.safety_incident_evidence
  ADD COLUMN IF NOT EXISTS original_file_name text;

-- One-time backfill so historical rows have an audit-stable original name.
UPDATE public.safety_incident_evidence
   SET original_file_name = file_name
 WHERE original_file_name IS NULL;

CREATE OR REPLACE FUNCTION public.rename_incident_evidence(
  p_evidence_id uuid,
  p_new_file_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row  record;
  v_new  text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  v_new := btrim(COALESCE(p_new_file_name, ''));
  IF v_new = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new file name is required');
  END IF;
  IF char_length(v_new) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'file name must be 200 characters or fewer');
  END IF;
  -- Block path separators / control chars in the display name.
  IF v_new ~ '[\/\\\\\n\r\t]' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'file name cannot contain slashes or control characters');
  END IF;

  SELECT * INTO v_row FROM public.safety_incident_evidence
    WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'evidence not found');
  END IF;

  IF v_row.uploaded_by <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only the uploader can rename this evidence');
  END IF;

  -- Preserve original on first rename (older rows are backfilled above).
  IF v_row.original_file_name IS NULL THEN
    UPDATE public.safety_incident_evidence
       SET original_file_name = v_row.file_name
     WHERE id = p_evidence_id;
  END IF;

  UPDATE public.safety_incident_evidence
     SET file_name = v_new
   WHERE id = p_evidence_id;

  INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
  VALUES (
    'incident.evidence_renamed',
    'safety_incident_evidence',
    p_evidence_id,
    v_user,
    jsonb_build_object(
      'incident_id', v_row.incident_id,
      'previous_name', v_row.file_name,
      'new_name', v_new,
      'original_name', COALESCE(v_row.original_file_name, v_row.file_name),
      'file_path', v_row.file_path
    )
  );

  RETURN jsonb_build_object('ok', true, 'evidence_id', p_evidence_id, 'file_name', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_incident_evidence(uuid, text) TO authenticated;

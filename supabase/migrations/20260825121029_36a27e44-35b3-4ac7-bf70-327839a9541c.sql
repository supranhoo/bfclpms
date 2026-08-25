CREATE OR REPLACE FUNCTION public.bu_console_decide_merge_proposals(
  p_ids uuid[],
  p_approve boolean,
  p_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_decided int := 0;
  v_requested int := COALESCE(array_length(p_ids, 1), 0);
BEGIN
  IF NOT public.bu_console_can_write(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can decide merge proposals';
  END IF;

  IF v_requested = 0 THEN
    RETURN jsonb_build_object('requested', 0, 'decided', 0, 'skipped', 0);
  END IF;

  IF v_requested > 500 THEN
    RAISE EXCEPTION 'Bulk decision is limited to 500 proposals per call (got %)', v_requested;
  END IF;

  WITH upd AS (
    UPDATE public.kpi_merge_proposals
       SET status = CASE WHEN p_approve THEN 'approved'::public.kpi_merge_proposal_status
                         ELSE 'rejected'::public.kpi_merge_proposal_status END,
           decided_by = auth.uid(),
           decided_at = now(),
           decision_note = p_note
     WHERE id = ANY(p_ids)
       AND status = 'pending'
    RETURNING 1
  )
  SELECT count(*) INTO v_decided FROM upd;

  RETURN jsonb_build_object(
    'requested', v_requested,
    'decided', v_decided,
    'skipped', v_requested - v_decided,
    'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bu_console_decide_merge_proposals(uuid[], boolean, text) TO authenticated;
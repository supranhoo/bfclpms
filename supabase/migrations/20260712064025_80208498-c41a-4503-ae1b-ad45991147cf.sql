
CREATE OR REPLACE FUNCTION public.open_self_review_for_pending(_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle record;
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  IF _cycle_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id, status, self_review_start
    INTO v_cycle
  FROM public.annual_review_cycles
  WHERE id = _cycle_id;

  IF v_cycle.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Only auto-open when the cycle is active and its self window has begun.
  IF v_cycle.status <> 'active' OR v_cycle.self_review_start IS NULL OR v_cycle.self_review_start > now() THEN
    RETURN 0;
  END IF;

  -- Only operate on instances still parked at not_started; leave any advanced
  -- status (pending_manager, pending_dept, completed, excluded, etc.) alone.
  WITH updated AS (
    UPDATE public.annual_review_instances
       SET overall_status = 'pending_self'::annual_review_status,
           updated_at = now()
     WHERE cycle_id = _cycle_id
       AND overall_status = 'not_started'::annual_review_status
    RETURNING id
  )
  SELECT array_agg(id), count(*)::int INTO v_ids, v_count FROM updated;

  IF v_count > 0 THEN
    INSERT INTO public.system_audit_logs (action, performed_by, metadata)
    VALUES (
      'AR_OPEN_SELF_LATE_SEED',
      auth.uid(),
      jsonb_build_object(
        'cycle_id', _cycle_id,
        'reason', 'Auto-open of late-seeded annual review instances (§AR-SELF-OPEN-LATE)',
        'instance_ids', to_jsonb(v_ids),
        'count', v_count
      )
    );
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_self_review_for_pending(uuid) TO authenticated, service_role;

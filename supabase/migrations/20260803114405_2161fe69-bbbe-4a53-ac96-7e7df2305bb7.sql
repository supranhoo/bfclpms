CREATE OR REPLACE FUNCTION public.annual_review_instance_change_log(
  p_instance_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  occurred_at timestamptz,
  event_type text,
  field_label text,
  old_value text,
  new_value text,
  actor_id uuid,
  actor_name text,
  reason text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Not authorized to view the annual review change log';
  END IF;

  RETURN QUERY
  WITH events AS (
    -- Rating calibration set / cleared
    SELECT a.created_at AS occurred_at,
           'calibration'::text AS event_type,
           CASE WHEN a.action = 'clear' THEN 'Calibration cleared' ELSE 'Final rating calibrated' END AS field_label,
           CASE WHEN a.old_rating IS NULL THEN NULL ELSE to_char(a.old_rating, 'FM990.00') END AS old_value,
           CASE WHEN a.new_rating IS NULL THEN NULL ELSE to_char(a.new_rating, 'FM990.00') END AS new_value,
           a.performed_by AS actor_id,
           a.reason AS reason
    FROM public.annual_review_calibration_audit a
    WHERE a.instance_id = p_instance_id

    UNION ALL
    -- Final score recompute
    SELECT r.created_at,
           'final_score',
           'Final score recomputed',
           CASE WHEN r.old_total_score IS NULL THEN NULL
                ELSE to_char(r.old_total_score, 'FM990.00') || ' / 100'
                     || COALESCE(' (' || r.old_final_rating || ')', '') END,
           CASE WHEN r.new_total_score IS NULL THEN NULL
                ELSE to_char(r.new_total_score, 'FM990.00') || ' / 100'
                     || COALESCE(' (' || r.new_final_rating || ')', '') END,
           r.performed_by,
           COALESCE(r.reason, r.source)
    FROM public.annual_review_final_score_recompute_audit r
    WHERE r.instance_id = p_instance_id

    UNION ALL
    -- System score corrections / upgrades
    SELECT e.created_at,
           'system_score',
           'System score: ' || COALESCE(NULLIF(e.slot_name, ''), e.slot_id),
           CASE WHEN e.old_raw IS NULL THEN NULL ELSE to_char(e.old_raw, 'FM990.00') END,
           CASE WHEN e.new_raw IS NULL THEN NULL ELSE to_char(e.new_raw, 'FM990.00') END,
           e.edited_by,
           e.reason
    FROM public.annual_review_system_score_edits e
    WHERE e.instance_id = p_instance_id

    UNION ALL
    -- Eligibility exemption requested
    SELECT x.requested_at,
           'exemption',
           'Exemption requested: ' || COALESCE(NULLIF(x.criterion_name, ''), x.criterion_id),
           NULL,
           'requested',
           x.requested_by,
           x.reason
    FROM public.annual_review_eligibility_exemptions x
    WHERE x.instance_id = p_instance_id AND x.requested_at IS NOT NULL

    UNION ALL
    -- Eligibility exemption decided
    SELECT x.decided_at,
           'exemption',
           'Exemption ' || x.status || ': ' || COALESCE(NULLIF(x.criterion_name, ''), x.criterion_id),
           'pending',
           x.status
             || CASE WHEN x.penalty_applied THEN
                  ' (slab ' || COALESCE(to_char(x.penalty_from_percent, 'FM990.00'), '—') || '% -> '
                  || COALESCE(to_char(x.penalty_to_percent, 'FM990.00'), '—') || '%)'
                ELSE '' END,
           x.decided_by,
           COALESCE(x.decision_note, x.penalty_note)
    FROM public.annual_review_eligibility_exemptions x
    WHERE x.instance_id = p_instance_id AND x.decided_at IS NOT NULL

    UNION ALL
    -- Stage submissions
    SELECT resp.submitted_at,
           'stage',
           'Stage submitted: ' || replace(resp.reviewer_role::text, '_', ' '),
           NULL,
           CASE WHEN resp.weighted_score IS NULL THEN NULL
                ELSE to_char(resp.weighted_score, 'FM990.00') END,
           resp.reviewer_id,
           NULL
    FROM public.annual_review_responses resp
    WHERE resp.instance_id = p_instance_id AND resp.submitted_at IS NOT NULL
  ),
  counted AS (
    SELECT ev.*, COUNT(*) OVER () AS total_count
    FROM events ev
    WHERE ev.occurred_at IS NOT NULL
  )
  SELECT c.occurred_at,
         c.event_type,
         c.field_label,
         c.old_value,
         c.new_value,
         c.actor_id,
         p.full_name AS actor_name,
         c.reason,
         c.total_count
  FROM counted c
  LEFT JOIN public.profiles p ON p.id = c.actor_id
  ORDER BY c.occurred_at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.annual_review_instance_change_log(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annual_review_instance_change_log(uuid, integer, integer) TO authenticated;
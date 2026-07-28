-- ADR-189 follow-up: mention access must be granted BEFORE the notification is
-- inserted, because the access row is what makes the recipient a thread
-- participant for public.can_send_notification_to(..., jsonb).
CREATE OR REPLACE FUNCTION public.post_observation_reply(
  p_observation_id uuid,
  p_reply_text text,
  p_evidence_urls jsonb DEFAULT NULL,
  p_mentioned_user_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller   uuid := auth.uid();
  v_reply    public.kpi_observation_replies%ROWTYPE;
  v_obs      public.kpi_observations%ROWTYPE;
  v_kpi_name text;
  v_emp      uuid;
  v_sender   text;
  v_short    text;
  v_target   uuid;
  v_notified uuid[] := '{}';
  v_skipped  uuid[] := '{}';
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reply_text IS NULL OR btrim(p_reply_text) = '' THEN
    RAISE EXCEPTION 'Reply text is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.kpi_observation_replies (observation_id, reply_by, reply_text, evidence_urls)
  VALUES (
    p_observation_id,
    v_caller,
    p_reply_text,
    CASE WHEN p_evidence_urls IS NULL OR jsonb_array_length(p_evidence_urls) = 0
         THEN NULL ELSE p_evidence_urls END
  )
  RETURNING * INTO v_reply;

  UPDATE public.kpi_observations
     SET status = 'acknowledged'
   WHERE id = p_observation_id
     AND status = 'open';

  SELECT * INTO v_obs FROM public.kpi_observations WHERE id = p_observation_id;
  SELECT k.employee_id, k.kpi_name INTO v_emp, v_kpi_name
    FROM public.kpis k WHERE k.id = v_obs.kpi_id;

  SELECT COALESCE(pr.full_name, pr.email, 'Someone') INTO v_sender
    FROM public.profiles pr WHERE pr.id = v_caller;

  v_short := left(btrim(split_part(COALESCE(v_kpi_name, 'a KPI'), E'\n', 1)), 80);

  IF p_mentioned_user_ids IS NOT NULL THEN
    FOR v_target IN
      SELECT DISTINCT u FROM unnest(p_mentioned_user_ids) AS u WHERE u <> v_caller
    LOOP
      BEGIN
        INSERT INTO public.kpi_mention_access (kpi_id, user_id, granted_by)
        VALUES (v_obs.kpi_id, v_target, v_caller)
        ON CONFLICT (kpi_id, user_id) DO NOTHING;

        INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
        VALUES (
          v_target,
          'observation_mention',
          '@Mentioned in Observation',
          format('%s mentioned you in observation %s on %s',
                 v_sender, COALESCE(v_obs.ticket_number, ''), v_short),
          v_obs.kpi_id,
          v_caller,
          jsonb_build_object(
            'employee_id', v_emp,
            'observation_id', p_observation_id,
            'ticket_number', v_obs.ticket_number
          )
        );

        v_notified := v_notified || v_target;
      EXCEPTION
        -- POLICY §OBS-REPLY-ATOMICITY: notification failures degrade
        -- gracefully; they must never block the reply itself.
        WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN
          v_skipped := v_skipped || v_target;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'reply', to_jsonb(v_reply),
    'notified', to_jsonb(v_notified),
    'skipped', to_jsonb(v_skipped)
  );
END;
$function$;
-- ============================================================================
-- ADR-189 — Observation thread participation as a notification edge
-- POLICY §108g / §OBS-REPLY-ATOMICITY
--
-- ROLLBACK: the 2-arg public.can_send_notification_to(uuid,uuid) body is NOT
-- modified by this migration. To revert, drop the 3-arg overload, drop
-- public.is_observation_participant, drop public.post_observation_reply and
-- restore tg_notifications_enforce_sender_relationship() to call the 2-arg
-- guard (definition preserved in migration 20260722102742_*.sql lineage).
-- ============================================================================

-- 1) SSOT helper: conversation membership -----------------------------------
CREATE OR REPLACE FUNCTION public.is_observation_participant(
  _user uuid,
  _observation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.kpi_observations o
      JOIN public.kpis k ON k.id = o.kpi_id
     WHERE o.id = _observation_id
       AND (
            o.created_by = _user
         OR k.employee_id = _user
         OR EXISTS (SELECT 1 FROM public.kpi_observation_replies r
                     WHERE r.observation_id = o.id AND r.reply_by = _user)
         OR EXISTS (SELECT 1 FROM public.kpi_mention_access ma
                     WHERE ma.kpi_id = o.kpi_id AND ma.user_id = _user)
       )
     LIMIT 1
  ) AND _user IS NOT NULL AND _observation_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.is_observation_participant(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_observation_participant(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_observation_participant(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_observation_participant(uuid, uuid) IS
  'ADR-189: SSOT for observation thread membership (author, KPI owner, replier, mentioned user).';

-- 2) Context-aware overload of the notification guard -----------------------
CREATE OR REPLACE FUNCTION public.can_send_notification_to(
  sender uuid,
  target uuid,
  context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_obs uuid;
BEGIN
  -- All pre-existing edges remain authoritative and unchanged.
  IF public.can_send_notification_to(sender, target) THEN
    RETURN true;
  END IF;

  IF context IS NULL OR sender IS NULL OR target IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_obs := NULLIF(context->>'observation_id', '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF v_obs IS NULL THEN
    RETURN false;
  END IF;

  -- ADR-189 (POLICY §108g): both parties must already belong to the thread.
  RETURN public.is_observation_participant(sender, v_obs)
     AND public.is_observation_participant(target, v_obs);
END;
$function$;

REVOKE ALL ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) IS
  'ADR-189: 2-arg guard plus the observation-thread-participation edge. Context: {"observation_id": uuid}.';

-- 3) Trigger passes thread context ------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_notifications_enforce_sender_relationship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Server-side / trigger context (no JWT): allow unchanged.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'notifications.user_id is required'
      USING ERRCODE = '23502';
  END IF;

  IF NEW.related_user_id IS NULL AND NEW.user_id <> v_caller THEN
    NEW.related_user_id := v_caller;
  END IF;

  -- ADR-189: metadata may carry an observation_id, which authorises
  -- notifications between two participants of that same thread.
  IF NOT public.can_send_notification_to(v_caller, NEW.user_id, NEW.metadata) THEN
    RAISE EXCEPTION 'not authorized to send notifications to user %', NEW.user_id
      USING ERRCODE = '42501',
            HINT   = 'Sender must be admin, HR PMS, share a manager/reviewer relationship, or both parties must participate in the referenced observation thread.';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Atomic observation reply RPC -------------------------------------------
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

  -- RLS on kpi_observation_replies still applies (SECURITY INVOKER).
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

        INSERT INTO public.kpi_mention_access (kpi_id, user_id, granted_by)
        VALUES (v_obs.kpi_id, v_target, v_caller)
        ON CONFLICT (kpi_id, user_id) DO NOTHING;

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

REVOKE ALL ON FUNCTION public.post_observation_reply(uuid, text, jsonb, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_observation_reply(uuid, text, jsonb, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_observation_reply(uuid, text, jsonb, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_observation_reply(uuid, text, jsonb, uuid[]) IS
  'ADR-189 / POLICY §OBS-REPLY-ATOMICITY: atomic observation reply + acknowledge + mention notifications + mention access.';
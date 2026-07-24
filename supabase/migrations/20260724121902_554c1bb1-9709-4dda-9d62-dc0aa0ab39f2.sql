
DO $$
DECLARE
  v_bu_head_ids uuid[] := ARRAY['66b76d0c-72c0-4588-baa7-718cee76c99b'::uuid];
  v_extra_ids uuid[];
  v_rec record;
  v_resp jsonb;
  v_scores jsonb;
  v_weighted numeric(6,2);
  v_submitted timestamptz;
  v_restored int := 0;
  v_skipped int := 0;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_extra_ids
    FROM public.profiles
   WHERE employee_code IN ('101885','102028');
  v_bu_head_ids := v_bu_head_ids || COALESCE(v_extra_ids, ARRAY[]::uuid[]);

  FOR v_rec IN
    SELECT i.id AS instance_id, i.bu_head_id, i.employee_id,
           a.id AS archive_id, a.wiped_responses
      FROM public.annual_review_instances i
      JOIN public.annual_review_reset_archive a ON a.instance_id = i.id
     WHERE i.bu_head_id = ANY(v_bu_head_ids)
       AND i.overall_status = 'pending_bu'
       AND a.reason LIKE 'ADR-155%'
       AND NOT EXISTS (
         SELECT 1 FROM public.annual_review_responses r
          WHERE r.instance_id = i.id AND r.reviewer_role = 'bu_head'
       )
  LOOP
    v_resp := v_rec.wiped_responses->0;

    IF v_resp IS NULL
       OR (v_resp->>'reviewer_id')::uuid IS DISTINCT FROM v_rec.bu_head_id
       OR NOT COALESCE((v_resp->>'is_locked')::boolean, false)
       OR jsonb_typeof(v_resp->'criteria_scores') <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_resp->'criteria_scores')) = 0
    THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_scores    := COALESCE(v_resp->'criteria_scores', '{}'::jsonb);
    v_weighted  := NULLIF(v_resp->>'weighted_score','')::numeric(6,2);
    v_submitted := COALESCE(NULLIF(v_resp->>'submitted_at','')::timestamptz, now());

    INSERT INTO public.annual_review_responses (
      instance_id, reviewer_id, reviewer_role,
      criteria_scores, qualitative_responses, evidence,
      weighted_score, submitted_at, is_locked, notes
    ) VALUES (
      v_rec.instance_id, v_rec.bu_head_id, 'bu_head',
      v_scores,
      COALESCE(v_resp->'qualitative_responses','{}'::jsonb),
      COALESCE(v_resp->'evidence','[]'::jsonb),
      v_weighted, v_submitted, true,
      COALESCE(v_resp->>'notes','') ||
        CASE WHEN COALESCE(v_resp->>'notes','') = '' THEN '' ELSE E'\n\n' END ||
        '[ADR-159] Restored from ADR-155 archive on ' || now()::date
    );

    PERFORM public.hydrate_annual_review_system_scores(v_rec.instance_id);

    UPDATE public.annual_review_instances
       SET total_score = COALESCE(v_weighted, total_score),
           criteria_weighted_score = COALESCE(v_weighted, criteria_weighted_score),
           overall_status = 'completed',
           finalized_at = COALESCE(finalized_at, v_submitted),
           finalized_by = COALESCE(finalized_by, v_rec.bu_head_id)
     WHERE id = v_rec.instance_id;

    INSERT INTO public.annual_review_access_audit (
      actor_id, target_user_id, action, reason, after
    ) VALUES (
      NULL,
      v_rec.employee_id,
      'bu_terminal_restore',
      'ADR-159 restore: bu_head promotion from ADR-155 archive',
      jsonb_build_object(
        'instance_id', v_rec.instance_id,
        'bu_head_id', v_rec.bu_head_id,
        'archive_id', v_rec.archive_id,
        'weighted_score', v_weighted
      )
    );

    v_restored := v_restored + 1;
  END LOOP;

  RAISE NOTICE 'ADR-159 restore complete: restored=%, skipped=%', v_restored, v_skipped;
END $$;

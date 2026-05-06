CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(
  p_kpi_ratings jsonb,
  p_is_na boolean DEFAULT false,
  p_remarks text DEFAULT NULL,
  p_overwrite_policy text DEFAULT 'pre_review_only'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  old_score numeric;
  v_current_status text;
  v_row_count int;
  result jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  propagated_count int := 0;
  skipped_count int := 0;
  v_evidence_url text;
  v_evidence_urls jsonb;
  v_user uuid;
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_allow_overwrite boolean;
  v_target_status text;
  v_kpi_id uuid;
  v_self_score numeric;
  v_achieved_value numeric;
BEGIN
  v_user := auth.uid();

  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal') THEN
    v_policy := 'pre_review_only';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    v_kpi_id := (item->>'kpi_id')::uuid;

    SELECT status::text INTO v_current_status
    FROM kpis WHERE id = v_kpi_id;

    IF v_current_status IS NULL THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id, 'current_status', 'missing', 'reason', 'kpi_not_found'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    v_allow_overwrite := CASE v_policy
      WHEN 'safe' THEN v_current_status = 'kra_set'
      WHEN 'pre_review_only' THEN v_current_status IN ('kra_set','self_review')
      WHEN 'force_pre_terminal' THEN v_current_status NOT IN (
        'manager_check','auditor_check','management_review','final','approved'
      )
      ELSE false
    END;

    IF NOT v_allow_overwrite THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id,
        'current_status', v_current_status,
        'reason', CASE
          WHEN v_current_status IN ('manager_check','auditor_check','management_review','final','approved')
            THEN 'reviewer_locked'
          ELSE 'not_in_kra_set'
        END
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT self_score INTO old_score FROM review_submissions WHERE kpi_id = v_kpi_id;

    v_evidence_url := item->>'evidence_url';
    v_evidence_urls := CASE
      WHEN v_evidence_url IS NOT NULL AND v_evidence_url != ''
      THEN jsonb_build_array(v_evidence_url)
      ELSE NULL
    END;

    v_self_score := CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END;
    v_achieved_value := CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END;

    v_target_status := CASE WHEN v_current_status = 'kra_set' THEN 'self_review' ELSE v_current_status END;

    UPDATE public.kpis SET status = v_target_status::public.review_status WHERE id = v_kpi_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    IF v_row_count = 0 THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id, 'current_status', v_current_status, 'reason', 'race_lost_during_advance'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO review_submissions (
      kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    )
    VALUES (
      v_kpi_id, v_achieved_value, v_self_score,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_rating')::text::rating_level END,
      p_is_na,
      CASE WHEN p_is_na THEN 'admin' ELSE NULL END,
      CASE WHEN p_is_na THEN NULL ELSE v_evidence_url END,
      CASE WHEN p_is_na THEN NULL ELSE v_evidence_urls END,
      CASE WHEN p_is_na THEN NULL ELSE p_remarks END,
      now()
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      achieved_value = EXCLUDED.achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      self_evidence_url = COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url),
      self_evidence_urls = COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls),
      self_remarks = COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks),
      updated_at = now();

    IF old_score IS DISTINCT FROM v_self_score THEN
      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        v_kpi_id, 'ORG_KPI_VALUE_OVERWRITTEN', v_user,
        jsonb_build_object(
          'old_self_score', old_score,
          'new_self_score', v_self_score,
          'achieved_value', v_achieved_value,
          'overwrite_policy', v_policy,
          'prior_status', v_current_status
        )
      );
    END IF;

    propagated_count := propagated_count + 1;

    result := result || jsonb_build_object(
      'kpi_id', v_kpi_id,
      'old_score', old_score,
      'new_score', v_self_score,
      'prior_status', v_current_status,
      'new_status', v_target_status
    );
  END LOOP;

  RETURN jsonb_build_object(
    'propagated', propagated_count,
    'skipped', skipped_count,
    'results', result,
    'skipped_details', skipped
  );
END;
$function$;
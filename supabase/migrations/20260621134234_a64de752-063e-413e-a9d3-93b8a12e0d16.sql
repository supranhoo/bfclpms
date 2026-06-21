
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS self_achieved_value numeric;

COMMENT ON COLUMN public.review_submissions.self_achieved_value IS
  'Frozen achieved value entered by the employee (or written by Org KPI data-owner propagation) at self-submit time. Read by KpiJourneySection Self stage.';

-- One-time backfill: bypass user triggers (period-lock guard, repercolate,
-- final-score recompute, etc.) so we can populate the new column on already
-- locked / approved rows. The new column is display-only; this does not
-- change any scoring or workflow state.
SET LOCAL session_replication_role = 'replica';

WITH self_logs AS (
  SELECT DISTINCT ON (kpi_id)
    kpi_id,
    NULLIF(new_value->>'achieved_value','')::numeric AS av
  FROM public.kpi_audit_logs
  WHERE action = 'SELF_REVIEW_SUBMITTED'
    AND new_value ? 'achieved_value'
  ORDER BY kpi_id, created_at DESC
),
prop_logs AS (
  SELECT DISTINCT ON (kpi_id)
    kpi_id,
    NULLIF(new_value->>'achieved_value','')::numeric AS av
  FROM public.kpi_audit_logs
  WHERE action = 'ORG_KPI_PROPAGATED'
    AND new_value ? 'achieved_value'
  ORDER BY kpi_id, created_at DESC
),
resolved AS (
  SELECT
    COALESCE(s.kpi_id, p.kpi_id) AS kpi_id,
    COALESCE(s.av, p.av) AS av
  FROM self_logs s
  FULL OUTER JOIN prop_logs p USING (kpi_id)
)
UPDATE public.review_submissions rs
SET self_achieved_value = r.av
FROM resolved r
WHERE rs.kpi_id = r.kpi_id
  AND rs.self_achieved_value IS NULL
  AND r.av IS NOT NULL;

UPDATE public.review_submissions
SET self_achieved_value = achieved_value
WHERE self_achieved_value IS NULL
  AND achieved_value IS NOT NULL
  AND self_score IS NOT NULL
  AND manager_achieved_value IS NULL
  AND auditor_achieved_value IS NULL
  AND management_achieved_value IS NULL
  AND skip_level_achieved_value IS NULL
  AND hr_pms_achieved_value IS NULL;

SET LOCAL session_replication_role = 'origin';

CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(
  p_kpi_ratings jsonb,
  p_is_na boolean DEFAULT false,
  p_remarks text DEFAULT NULL::text,
  p_overwrite_policy text DEFAULT 'pre_review_only'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  old_score numeric;
  v_old_remarks text;
  v_old_evidence_urls jsonb;
  v_current_status text;
  v_row_count int;
  result jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  propagated_count int := 0;
  skipped_count int := 0;
  v_evidence_url text;
  v_evidence_urls jsonb;
  v_user uuid;
  v_is_admin boolean;
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_allow_overwrite boolean;
  v_target_status text;
  v_kpi_id uuid;
  v_self_score numeric;
  v_achieved_value numeric;
  v_step_back boolean;
  v_overwrite_mode boolean;
  v_kpi_cat uuid;
  v_kpi_kra text;
  v_kpi_kpi text;
  v_is_org_level boolean;
  v_authorized boolean;
  v_stages_after_self_review text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review'
  ];
  v_locked_statuses text[] := ARRAY[
    'manager_check','audit','skip_level_check',
    'hr_pms_review','management_review','approved'
  ];
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal','overwrite_and_stepback') THEN
    v_policy := 'pre_review_only';
  END IF;

  v_overwrite_mode := (v_policy = 'overwrite_and_stepback');
  v_is_admin := public.has_role(v_user, 'admin'::public.app_role);

  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    v_kpi_id := (item->>'kpi_id')::uuid;

    SELECT status::text, category_id, kra_name, kpi_name, is_org_level
      INTO v_current_status, v_kpi_cat, v_kpi_kra, v_kpi_kpi, v_is_org_level
    FROM kpis WHERE id = v_kpi_id;

    IF v_current_status IS NULL THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id, 'current_status', 'missing', 'reason', 'kpi_not_found'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    v_authorized := v_is_admin;
    IF NOT v_authorized THEN
      IF COALESCE(v_is_org_level, false) THEN
        SELECT EXISTS (
          SELECT 1 FROM org_kpi_data_owners o
          WHERE o.owner_id = v_user
            AND o.category_id = v_kpi_cat
            AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(v_kpi_kra)
            AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(v_kpi_kpi)
        ) INTO v_authorized;
      END IF;
    END IF;

    IF NOT v_authorized THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id,
        'current_status', v_current_status,
        'reason', 'not_authorized'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    v_allow_overwrite := CASE v_policy
      WHEN 'safe' THEN v_current_status = 'kra_set'
      WHEN 'pre_review_only' THEN v_current_status IN ('kra_set','self_review')
      WHEN 'force_pre_terminal' THEN NOT (v_current_status = ANY(v_locked_statuses))
      WHEN 'overwrite_and_stepback' THEN v_current_status <> 'approved'
      ELSE false
    END;

    IF NOT v_allow_overwrite THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', v_kpi_id,
        'current_status', v_current_status,
        'reason', CASE
          WHEN v_overwrite_mode AND v_current_status = 'approved' THEN 'approved_immutable'
          WHEN v_current_status = ANY(v_locked_statuses) THEN 'reviewer_locked'
          ELSE 'not_in_kra_set'
        END
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT self_score, self_remarks, self_evidence_urls
      INTO old_score, v_old_remarks, v_old_evidence_urls
      FROM review_submissions WHERE kpi_id = v_kpi_id;

    v_evidence_url := item->>'evidence_url';
    v_evidence_urls := CASE
      WHEN v_evidence_url IS NOT NULL AND v_evidence_url != ''
      THEN jsonb_build_array(v_evidence_url)
      ELSE NULL
    END;

    v_self_score := CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END;
    v_achieved_value := CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END;

    v_step_back := v_overwrite_mode AND v_current_status = ANY(v_stages_after_self_review);
    v_target_status := CASE
      WHEN v_step_back THEN 'self_review'
      WHEN v_current_status = 'kra_set' THEN 'self_review'
      ELSE v_current_status
    END;

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
      kpi_id, achieved_value, self_achieved_value,
      self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    )
    VALUES (
      v_kpi_id, v_achieved_value, v_achieved_value,
      v_self_score,
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
      self_achieved_value = EXCLUDED.self_achieved_value,
      self_score = EXCLUDED.self_score,
      self_rating = EXCLUDED.self_rating,
      is_na = EXCLUDED.is_na,
      na_marked_by_role = EXCLUDED.na_marked_by_role,
      self_evidence_url = CASE
        WHEN v_overwrite_mode THEN EXCLUDED.self_evidence_url
        ELSE COALESCE(EXCLUDED.self_evidence_url, review_submissions.self_evidence_url)
      END,
      self_evidence_urls = CASE
        WHEN v_overwrite_mode THEN EXCLUDED.self_evidence_urls
        ELSE COALESCE(EXCLUDED.self_evidence_urls, review_submissions.self_evidence_urls)
      END,
      self_remarks = CASE
        WHEN v_overwrite_mode THEN EXCLUDED.self_remarks
        ELSE COALESCE(EXCLUDED.self_remarks, review_submissions.self_remarks)
      END,
      updated_at = now();

    IF v_step_back THEN
      UPDATE review_submissions
      SET
        manager_score = NULL, manager_rating = NULL, manager_remarks = NULL,
        manager_evidence_url = NULL, manager_evidence_urls = NULL, manager_achieved_value = NULL,
        auditor_score = NULL, auditor_rating = NULL, auditor_remarks = NULL,
        auditor_evidence_url = NULL, auditor_evidence_urls = NULL, auditor_achieved_value = NULL,
        skip_level_score = NULL, skip_level_rating = NULL, skip_level_remarks = NULL,
        skip_level_evidence_url = NULL, skip_level_evidence_urls = NULL, skip_level_achieved_value = NULL,
        hr_pms_score = NULL, hr_pms_rating = NULL, hr_pms_remarks = NULL,
        hr_pms_evidence_url = NULL, hr_pms_evidence_urls = NULL, hr_pms_achieved_value = NULL,
        management_score = NULL, management_rating = NULL, management_remarks = NULL,
        management_evidence_url = NULL, management_evidence_urls = NULL, management_achieved_value = NULL,
        final_score = NULL, final_rating = NULL,
        updated_at = now()
      WHERE kpi_id = v_kpi_id;
    END IF;

    IF old_score IS DISTINCT FROM v_self_score
       OR (v_overwrite_mode AND (v_step_back OR v_old_remarks IS DISTINCT FROM p_remarks))
    THEN
      INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (
        v_kpi_id, 'ORG_KPI_VALUE_OVERWRITTEN', v_user,
        jsonb_build_object(
          'old_self_score', old_score,
          'new_self_score', v_self_score,
          'achieved_value', v_achieved_value,
          'overwrite_policy', v_policy,
          'prior_status', v_current_status,
          'new_status', v_target_status,
          'step_back', v_step_back,
          'prior_self_remarks', v_old_remarks,
          'prior_self_evidence_urls', v_old_evidence_urls
        )
      );
    END IF;

    propagated_count := propagated_count + 1;

    result := result || jsonb_build_object(
      'kpi_id', v_kpi_id,
      'old_score', old_score,
      'new_score', v_self_score,
      'prior_status', v_current_status,
      'new_status', v_target_status,
      'step_back', v_step_back
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

-- ADR-064: 'overwrite_and_stepback' — admin OKV is source of truth.
-- Adds a 4th overwrite policy that:
--   * overwrites self_* fields unconditionally,
--   * regresses kpis.status to 'self_review' if past it,
--   * clears reviewer scores/remarks/evidence at-or-after the prior stage,
--   * never touches 'approved' rows.

-- 1) Replace propagate_org_kpi_value (signature unchanged)
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
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_allow_overwrite boolean;
  v_target_status text;
  v_kpi_id uuid;
  v_self_score numeric;
  v_achieved_value numeric;
  v_step_back boolean;
  v_overwrite_mode boolean;
  -- Stages whose reviewer columns must be cleared if we regress past them.
  -- Ordering mirrors the workflow chain.
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

  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal','overwrite_and_stepback') THEN
    v_policy := 'pre_review_only';
  END IF;

  v_overwrite_mode := (v_policy = 'overwrite_and_stepback');

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

    -- Step back to self_review whenever overwrite_and_stepback is used and
    -- the row has progressed past self_review. For kra_set, advance once to
    -- self_review (parity with the other policies).
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
      -- In overwrite_and_stepback admin's values fully replace prior self-*
      -- columns (NULL = clear). Other policies preserve prior values when
      -- the new payload is NULL.
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

    -- Cascade-clear reviewer columns when stepping back. We deliberately
    -- clear every reviewer stage (manager → management) because the
    -- self-review will re-run the full downstream chain. final_score is
    -- preserved only if the row was 'approved' (already filtered out above)
    -- so we may clear it here safely.
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

GRANT EXECUTE ON FUNCTION public.propagate_org_kpi_value(jsonb, boolean, text, text) TO authenticated;

COMMENT ON FUNCTION public.propagate_org_kpi_value(jsonb, boolean, text, text) IS
  'ADR-064 (May 2026): admin "overwrite_and_stepback" policy makes Org KPI Data Entry the source of truth — overwrites self_* fields and regresses past-self_review rows back to self_review, clearing reviewer columns. Approved rows are still immutable.';

-- 2) Extend preview RPC with the new policy (eligibility mirror)
CREATE OR REPLACE FUNCTION public.preview_org_kpi_propagation(
  p_kpi_ids uuid[],
  p_new_value numeric DEFAULT NULL,
  p_new_self_score numeric DEFAULT NULL,
  p_overwrite_policy text DEFAULT 'pre_review_only'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_will_advance int := 0;
  v_will_skip int := 0;
  v_total int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_policy text := COALESCE(p_overwrite_policy, 'pre_review_only');
  v_eligible boolean;
  v_reason text;
  rec record;
BEGIN
  IF v_policy NOT IN ('safe','pre_review_only','force_pre_terminal','overwrite_and_stepback') THEN
    v_policy := 'pre_review_only';
  END IF;

  IF p_kpi_ids IS NULL OR array_length(p_kpi_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('total',0,'will_advance',0,'will_skip',0,'breakdown','[]'::jsonb);
  END IF;

  FOR rec IN
    SELECT
      k_id AS kpi_id,
      k.status::text AS current_status,
      k.employee_id,
      p.full_name,
      p.employee_code,
      rs.achieved_value AS current_achieved,
      rs.self_score AS current_self_score
    FROM unnest(p_kpi_ids) AS k_id
    LEFT JOIN kpis k ON k.id = k_id
    LEFT JOIN profiles p ON p.id = k.employee_id
    LEFT JOIN review_submissions rs ON rs.kpi_id = k_id
  LOOP
    v_total := v_total + 1;

    IF rec.current_status IS NULL THEN
      v_eligible := false;
      v_reason := 'kpi_not_found';
    ELSE
      v_eligible := CASE v_policy
        WHEN 'safe' THEN rec.current_status = 'kra_set'
        WHEN 'pre_review_only' THEN rec.current_status IN ('kra_set','self_review')
        WHEN 'force_pre_terminal' THEN rec.current_status NOT IN
          ('manager_check','auditor_check','management_review','final','approved')
        WHEN 'overwrite_and_stepback' THEN rec.current_status <> 'approved'
        ELSE false
      END;
      v_reason := CASE
        WHEN v_eligible THEN 'eligible'
        WHEN v_policy = 'overwrite_and_stepback' AND rec.current_status = 'approved'
          THEN 'approved_immutable'
        WHEN rec.current_status IN ('manager_check','auditor_check','management_review','final','approved')
          THEN 'reviewer_locked'
        WHEN rec.current_status = 'self_review' AND v_policy = 'safe'
          THEN 'self_review_existing'
        ELSE 'not_in_kra_set'
      END;
    END IF;

    IF v_eligible THEN
      v_will_advance := v_will_advance + 1;
    ELSE
      v_will_skip := v_will_skip + 1;
    END IF;

    v_breakdown := v_breakdown || jsonb_build_object(
      'kpi_id', rec.kpi_id,
      'employee_name', rec.full_name,
      'employee_code', rec.employee_code,
      'current_status', COALESCE(rec.current_status, 'missing'),
      'will_advance', v_eligible,
      'reason', v_reason,
      'current_achieved', rec.current_achieved,
      'current_self_score', rec.current_self_score,
      'new_achieved', p_new_value,
      'new_self_score', p_new_self_score,
      'value_changes', (rec.current_achieved IS DISTINCT FROM p_new_value)
                       OR (rec.current_self_score IS DISTINCT FROM p_new_self_score)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total,
    'will_advance', v_will_advance,
    'will_skip', v_will_skip,
    'breakdown', v_breakdown
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.preview_org_kpi_propagation(uuid[], numeric, numeric, text) TO authenticated;
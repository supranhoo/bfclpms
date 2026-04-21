-- Step 3 (Phase A3): Patch propagate_org_kpi_value with ROW_COUNT enforcement,
-- skipped[] return, and PROPAGATION_PARTIAL audit logging.
-- The function body runs in a single implicit transaction, so atomicity is
-- guaranteed by PL/pgSQL — if any statement raises, the whole call rolls back.
-- The historical bug was that the status UPDATE silently affected 0 rows
-- (because the kpi was already past kra_set), yet the loop still incremented
-- propagated_count and inserted a review_submission. This patch fixes that.

-- ============================================================================
-- 3-arg overload (modern caller path: includes p_remarks)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(
  p_kpi_ratings jsonb,
  p_is_na boolean DEFAULT false,
  p_remarks text DEFAULT NULL::text
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
BEGIN
  v_user := auth.uid();

  FOR item IN SELECT * FROM jsonb_array_elements(p_kpi_ratings)
  LOOP
    -- Read current status BEFORE attempting advance
    SELECT status::text INTO v_current_status
    FROM kpis WHERE id = (item->>'kpi_id')::uuid;

    -- If kpi missing or not in kra_set, skip cleanly (do NOT insert submission)
    IF v_current_status IS NULL OR v_current_status <> 'kra_set' THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', item->>'kpi_id',
        'current_status', COALESCE(v_current_status, 'missing'),
        'reason', CASE
          WHEN v_current_status IS NULL THEN 'kpi_not_found'
          ELSE 'not_in_kra_set'
        END
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Capture old score for audit
    SELECT self_score INTO old_score
    FROM review_submissions WHERE kpi_id = (item->>'kpi_id')::uuid;

    v_evidence_url := item->>'evidence_url';
    v_evidence_urls := CASE
      WHEN v_evidence_url IS NOT NULL AND v_evidence_url != ''
      THEN jsonb_build_array(v_evidence_url)
      ELSE NULL
    END;

    -- Advance status guarded by current state; verify ROW_COUNT
    UPDATE kpis SET status = 'self_review'
    WHERE id = (item->>'kpi_id')::uuid AND status = 'kra_set';

    GET DIAGNOSTICS v_row_count = ROW_COUNT;

    -- Race condition: status changed between read and update
    IF v_row_count = 0 THEN
      skipped := skipped || jsonb_build_object(
        'kpi_id', item->>'kpi_id',
        'current_status', v_current_status,
        'reason', 'race_lost_during_advance'
      );
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    -- Status advanced — now safe to upsert submission
    INSERT INTO review_submissions (
      kpi_id, achieved_value, self_score, self_rating, is_na, na_marked_by_role,
      self_evidence_url, self_evidence_urls, self_remarks, updated_at
    )
    VALUES (
      (item->>'kpi_id')::uuid,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'achieved_value')::numeric END,
      CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END,
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

    propagated_count := propagated_count + 1;

    result := result || jsonb_build_object(
      'kpi_id', item->>'kpi_id',
      'old_score', old_score,
      'new_score', CASE WHEN p_is_na THEN NULL ELSE (item->>'self_score')::numeric END
    );
  END LOOP;

  -- Emit a single summary audit row when partial / total skip occurred
  IF skipped_count > 0 THEN
    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
    SELECT
      (s->>'kpi_id')::uuid,
      'PROPAGATION_PARTIAL',
      v_user,
      jsonb_build_object(
        'reason', s->>'reason',
        'current_status', s->>'current_status',
        'batch_propagated', propagated_count,
        'batch_skipped', skipped_count
      )
    FROM jsonb_array_elements(skipped) AS s
    WHERE EXISTS (SELECT 1 FROM kpis WHERE id = (s->>'kpi_id')::uuid);
  END IF;

  RETURN jsonb_build_object(
    'propagated_count', propagated_count,
    'skipped_count', skipped_count,
    'details', result,
    'skipped', skipped
  );
END;
$function$;

-- ============================================================================
-- 2-arg overload (legacy compatibility — delegates to 3-arg with NULL remarks)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(
  p_kpi_ratings jsonb,
  p_is_na boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.propagate_org_kpi_value(p_kpi_ratings, p_is_na, NULL::text);
END;
$function$;

COMMENT ON FUNCTION public.propagate_org_kpi_value(jsonb, boolean, text) IS
  'v2.66.0 (Phase A3): ROW_COUNT-guarded propagation. Returns {propagated_count, skipped_count, details, skipped[]}. Skips KPIs not in kra_set without inserting submissions. Whole call is atomic via PL/pgSQL implicit transaction.';
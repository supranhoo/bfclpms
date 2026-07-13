-- POLICY §SELF-REVIEW-SUBMIT-ORDER (v2): server-side atomic submit
-- Replaces the brittle client-side "flip status → upsert" sequence.

CREATE OR REPLACE FUNCTION public.submit_self_review(
  p_kpi_id uuid,
  p_achieved_value numeric,
  p_self_rating text,
  p_self_score numeric,
  p_self_remarks text,
  p_self_evidence_url text,
  p_self_evidence_urls jsonb,
  p_is_na boolean
)
RETURNS public.review_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kpi record;
  v_row public.review_submissions;
  v_old_status review_status;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, employee_id, status
    INTO v_kpi
    FROM public.kpis
   WHERE id = p_kpi_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KPI % not found', p_kpi_id USING ERRCODE = 'P0002';
  END IF;

  IF v_kpi.employee_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'insufficient privileges: you are not the owner of this KPI'
      USING ERRCODE = '42501';
  END IF;

  IF v_kpi.status NOT IN ('kra_set'::review_status, 'self_review'::review_status) THEN
    RAISE EXCEPTION 'KPI is at stage "%"; self-review is not allowed at this stage', v_kpi.status
      USING ERRCODE = '22023';
  END IF;

  v_old_status := v_kpi.status;

  -- Idempotent flip
  IF v_kpi.status = 'kra_set'::review_status THEN
    UPDATE public.kpis
       SET status = 'self_review'::review_status
     WHERE id = p_kpi_id;
  END IF;

  -- Atomic upsert of self-* fields ONLY (reviewer columns are never touched here).
  INSERT INTO public.review_submissions AS rs (
    kpi_id,
    achieved_value,
    self_achieved_value,
    self_rating,
    self_score,
    self_remarks,
    self_evidence_url,
    self_evidence_urls,
    is_na,
    na_marked_by_role,
    kpi_status
  ) VALUES (
    p_kpi_id,
    CASE WHEN p_is_na THEN NULL ELSE p_achieved_value END,
    CASE WHEN p_is_na THEN NULL ELSE p_achieved_value END,
    CASE WHEN p_is_na OR p_self_rating IS NULL THEN NULL ELSE p_self_rating::rating_level END,
    CASE WHEN p_is_na THEN NULL ELSE p_self_score END,
    p_self_remarks,
    p_self_evidence_url,
    COALESCE(p_self_evidence_urls, '[]'::jsonb),
    p_is_na,
    CASE WHEN p_is_na THEN 'employee' ELSE NULL END,
    'submitted'::kpi_status
  )
  ON CONFLICT (kpi_id) DO UPDATE
     SET achieved_value      = EXCLUDED.achieved_value,
         self_achieved_value = EXCLUDED.self_achieved_value,
         self_rating         = EXCLUDED.self_rating,
         self_score          = EXCLUDED.self_score,
         self_remarks        = EXCLUDED.self_remarks,
         self_evidence_url   = EXCLUDED.self_evidence_url,
         self_evidence_urls  = EXCLUDED.self_evidence_urls,
         is_na               = EXCLUDED.is_na,
         na_marked_by_role   = EXCLUDED.na_marked_by_role,
         kpi_status          = EXCLUDED.kpi_status,
         updated_at          = now()
  RETURNING * INTO v_row;

  -- Audit log (best-effort, mirrors previous client behaviour)
  BEGIN
    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value)
    VALUES (
      p_kpi_id,
      'SELF_REVIEW_SUBMITTED',
      v_uid,
      jsonb_build_object('status', v_old_status),
      jsonb_build_object(
        'status', 'self_review',
        'achieved_value', p_achieved_value,
        'self_score', p_self_score,
        'self_rating', p_self_rating,
        'is_na', p_is_na
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- never block submission on audit-log failure
    NULL;
  END;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_self_review(uuid, numeric, text, numeric, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_self_review(uuid, numeric, text, numeric, text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_self_review(uuid, numeric, text, numeric, text, text, jsonb, boolean) TO service_role;

COMMENT ON FUNCTION public.submit_self_review(uuid, numeric, text, numeric, text, text, jsonb, boolean) IS
'POLICY §SELF-REVIEW-SUBMIT-ORDER v2 — atomic self-review submit. Verifies caller owns the KPI, allows kra_set/self_review stages, flips status if needed, upserts self-* fields on review_submissions, and writes audit log. Replaces the two-step client flow that intermittently tripped RLS on review_submissions.';

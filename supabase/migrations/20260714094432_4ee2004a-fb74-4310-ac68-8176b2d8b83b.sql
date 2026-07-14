
-- Patch 1: Self-guard trigger honors a transaction-local bypass GUC set only
-- by vetted SECURITY DEFINER functions (currently: submit_self_review).
CREATE OR REPLACE FUNCTION public.tg_review_submissions_self_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_employee_id uuid;
  v_is_privileged boolean;
  v_bypass text;
BEGIN
  -- Bypass when running inside a vetted SECURITY DEFINER writer.
  -- The flag is set via `PERFORM set_config('app.self_submit_bypass','on',true)`
  -- which is transaction-local and cannot leak past the RPC txn.
  BEGIN
    v_bypass := current_setting('app.self_submit_bypass', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT k.employee_id INTO v_employee_id
  FROM public.kpis k
  WHERE k.id = COALESCE(NEW.kpi_id, OLD.kpi_id);

  IF v_employee_id IS DISTINCT FROM v_uid THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_is_privileged :=
       public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'hr_pms'::app_role)
    OR public.has_role(v_uid, 'auditor'::app_role)
    OR public.has_role(v_uid, 'management'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role);

  IF v_is_privileged THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.manager_score IS NOT NULL OR NEW.manager_rating IS NOT NULL OR NEW.manager_remarks IS NOT NULL
       OR NEW.manager_evidence_url IS NOT NULL OR NEW.manager_achieved_value IS NOT NULL
       OR NEW.auditor_score IS NOT NULL OR NEW.auditor_rating IS NOT NULL OR NEW.auditor_remarks IS NOT NULL
       OR NEW.auditor_evidence_url IS NOT NULL OR NEW.auditor_achieved_value IS NOT NULL
       OR NEW.management_score IS NOT NULL OR NEW.management_rating IS NOT NULL OR NEW.management_remarks IS NOT NULL
       OR NEW.management_evidence_url IS NOT NULL OR NEW.management_achieved_value IS NOT NULL
       OR NEW.final_score IS NOT NULL OR NEW.final_rating IS NOT NULL
    THEN
      RAISE EXCEPTION 'Employees cannot set reviewer fields on review_submissions (self-guard)';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.manager_score       IS DISTINCT FROM OLD.manager_score
   OR NEW.manager_rating     IS DISTINCT FROM OLD.manager_rating
   OR NEW.manager_remarks    IS DISTINCT FROM OLD.manager_remarks
   OR NEW.manager_evidence_url    IS DISTINCT FROM OLD.manager_evidence_url
   OR NEW.manager_evidence_urls   IS DISTINCT FROM OLD.manager_evidence_urls
   OR NEW.manager_achieved_value  IS DISTINCT FROM OLD.manager_achieved_value
   OR NEW.auditor_score      IS DISTINCT FROM OLD.auditor_score
   OR NEW.auditor_rating     IS DISTINCT FROM OLD.auditor_rating
   OR NEW.auditor_remarks    IS DISTINCT FROM OLD.auditor_remarks
   OR NEW.auditor_evidence_url    IS DISTINCT FROM OLD.auditor_evidence_url
   OR NEW.auditor_evidence_urls   IS DISTINCT FROM OLD.auditor_evidence_urls
   OR NEW.auditor_achieved_value  IS DISTINCT FROM OLD.auditor_achieved_value
   OR NEW.management_score   IS DISTINCT FROM OLD.management_score
   OR NEW.management_rating  IS DISTINCT FROM OLD.management_rating
   OR NEW.management_remarks IS DISTINCT FROM OLD.management_remarks
   OR NEW.management_evidence_url    IS DISTINCT FROM OLD.management_evidence_url
   OR NEW.management_evidence_urls   IS DISTINCT FROM OLD.management_evidence_urls
   OR NEW.management_achieved_value  IS DISTINCT FROM OLD.management_achieved_value
   OR NEW.final_score        IS DISTINCT FROM OLD.final_score
   OR NEW.final_rating       IS DISTINCT FROM OLD.final_rating
   OR NEW.final_score_rule_type       IS DISTINCT FROM OLD.final_score_rule_type
   OR NEW.final_score_rule_snapshot   IS DISTINCT FROM OLD.final_score_rule_snapshot
   OR NEW.final_score_explanation     IS DISTINCT FROM OLD.final_score_explanation
   OR NEW.final_score_calculated_at   IS DISTINCT FROM OLD.final_score_calculated_at
   OR NEW.functional_manager_remarks       IS DISTINCT FROM OLD.functional_manager_remarks
   OR NEW.functional_manager_evidence_urls IS DISTINCT FROM OLD.functional_manager_evidence_urls
   OR NEW.kpi_id             IS DISTINCT FROM OLD.kpi_id
   OR NEW.kpi_status         IS DISTINCT FROM OLD.kpi_status
   OR NEW.is_na              IS DISTINCT FROM OLD.is_na
  THEN
    RAISE EXCEPTION 'Employees cannot modify reviewer or workflow fields on review_submissions (self-guard)';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_review_submissions_self_column_guard() IS
'§REVIEW-SUBMISSION-SELF-UPDATE-GUARD — blocks reviewer/workflow column writes from the employee-self path. Bypassed inside vetted SECURITY DEFINER writers via transaction-local GUC app.self_submit_bypass=on (submit_self_review).';

-- Patch 2: submit_self_review raises the bypass flag for its own txn only.
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

  -- Transaction-local bypass for tg_review_submissions_self_column_guard.
  -- Third arg `true` = LOCAL: auto-cleared at txn end, cannot leak to other statements.
  PERFORM set_config('app.self_submit_bypass', 'on', true);

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

  IF v_kpi.status = 'kra_set'::review_status THEN
    UPDATE public.kpis
       SET status = 'self_review'::review_status
     WHERE id = p_kpi_id;
  END IF;

  INSERT INTO public.review_submissions AS rs (
    kpi_id, achieved_value, self_achieved_value, self_rating, self_score,
    self_remarks, self_evidence_url, self_evidence_urls, is_na, na_marked_by_role, kpi_status
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
    NULL;
  END;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.submit_self_review(uuid, numeric, text, numeric, text, text, jsonb, boolean) IS
'POLICY §SELF-REVIEW-SUBMIT-ORDER v3 — atomic self-review submit. Verifies caller owns the KPI, flips kpis.status if needed, upserts self-* fields on review_submissions (including kpi_status=submitted), and writes audit log. Raises transaction-local GUC app.self_submit_bypass=on so tg_review_submissions_self_column_guard permits the kpi_status transition on the ON CONFLICT UPDATE path (regression fix: re-submits on existing rows).';

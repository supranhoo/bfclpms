
-- §KPI-EMPLOYEE-SELF-UPDATE-GUARD (monthly KPI workflow only)
DROP POLICY IF EXISTS "Users can update their own KPIs" ON public.kpis;
CREATE POLICY "Users can update their own KPIs"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  employee_id = auth.uid()
  AND status = 'kra_set'::review_status
)
WITH CHECK (
  employee_id = auth.uid()
  AND status IN ('kra_set'::review_status, 'self_review'::review_status)
);

-- §REVIEW-SUBMISSION-SELF-UPDATE-GUARD (monthly KPI workflow only)
DROP POLICY IF EXISTS "Employees can create/update their own submissions" ON public.review_submissions;
CREATE POLICY "Employees can create their own submissions"
ON public.review_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND k.employee_id = auth.uid()
      AND k.status = 'self_review'::review_status
  )
  AND manager_score IS NULL AND manager_rating IS NULL AND manager_remarks IS NULL
  AND manager_evidence_url IS NULL AND manager_achieved_value IS NULL
  AND auditor_score IS NULL AND auditor_rating IS NULL AND auditor_remarks IS NULL
  AND auditor_evidence_url IS NULL AND auditor_achieved_value IS NULL
  AND management_score IS NULL AND management_rating IS NULL AND management_remarks IS NULL
  AND management_evidence_url IS NULL AND management_achieved_value IS NULL
  AND final_score IS NULL AND final_rating IS NULL
);

DROP POLICY IF EXISTS "Employees can update self review fields" ON public.review_submissions;
CREATE POLICY "Employees can update self review fields"
ON public.review_submissions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND k.employee_id = auth.uid()
      AND k.status = 'self_review'::review_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND k.employee_id = auth.uid()
      AND k.status = 'self_review'::review_status
  )
);

-- Column-level guard: block reviewer-owned column writes from the employee-self path.
CREATE OR REPLACE FUNCTION public.tg_review_submissions_self_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_employee_id uuid;
  v_is_privileged boolean;
BEGIN
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

DROP TRIGGER IF EXISTS tg_review_submissions_self_column_guard ON public.review_submissions;
CREATE TRIGGER tg_review_submissions_self_column_guard
  BEFORE INSERT OR UPDATE ON public.review_submissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_review_submissions_self_column_guard();

COMMENT ON FUNCTION public.tg_review_submissions_self_column_guard() IS
'§REVIEW-SUBMISSION-SELF-UPDATE-GUARD — blocks reviewer/workflow column writes from the employee-self path (monthly KPI workflow only).';

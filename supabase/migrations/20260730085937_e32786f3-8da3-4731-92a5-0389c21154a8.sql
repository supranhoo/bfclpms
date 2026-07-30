-- ADR-206 §WF-FM-REVIEW-ACTION
-- Resolve, per employee/period, the stage that immediately precedes
-- functional_manager_check in the employee's own workflow chain.
CREATE OR REPLACE FUNCTION public.fm_pending_status_for_kpi(_kpi_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp uuid;
  v_period text;
  v_year int;
  v_stages jsonb;
  v_idx int;
BEGIN
  SELECT k.employee_id, k.review_period, k.review_year
    INTO v_emp, v_period, v_year
  FROM public.kpis k WHERE k.id = _kpi_id;

  IF v_emp IS NULL THEN RETURN NULL; END IF;

  v_stages := public.get_employee_workflow(v_emp, v_period, v_year);
  IF v_stages IS NULL THEN RETURN NULL; END IF;

  SELECT ord - 1 INTO v_idx
  FROM jsonb_array_elements_text(v_stages) WITH ORDINALITY AS t(stage, ord)
  WHERE t.stage = 'functional_manager_check'
  LIMIT 1;

  IF v_idx IS NULL OR v_idx < 1 THEN RETURN NULL; END IF;

  RETURN v_stages ->> (v_idx - 1);
END;
$$;

-- True when the acting user is the FM of the KPI's employee AND the KPI is
-- either pending with the FM (status = stage preceding FM) or already at the
-- FM's own stage (re-edit before it moves on).
CREATE OR REPLACE FUNCTION public.is_fm_actionable_kpi(_kpi_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp uuid;
  v_status text;
  v_pending text;
BEGIN
  SELECT k.employee_id, k.status::text INTO v_emp, v_status
  FROM public.kpis k WHERE k.id = _kpi_id;

  IF v_emp IS NULL THEN RETURN false; END IF;
  IF NOT public.is_functional_manager_of(v_emp) THEN RETURN false; END IF;

  IF v_status = 'functional_manager_check' THEN RETURN true; END IF;

  v_pending := public.fm_pending_status_for_kpi(_kpi_id);
  RETURN v_pending IS NOT NULL AND v_pending = v_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fm_pending_status_for_kpi(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_fm_actionable_kpi(uuid) TO authenticated;

-- kpis: FM may act while the KPI is pending with them.
DROP POLICY IF EXISTS "FM can update KPI status on FM stage" ON public.kpis;
CREATE POLICY "FM can update KPI status on FM stage"
ON public.kpis
FOR UPDATE
USING (public.is_fm_actionable_kpi(id))
WITH CHECK (public.is_functional_manager_of(employee_id));

-- review_submissions: same correction + missing INSERT path.
DROP POLICY IF EXISTS "FM can update review_submissions on FM stage" ON public.review_submissions;
CREATE POLICY "FM can update review_submissions on FM stage"
ON public.review_submissions
FOR UPDATE
USING (public.is_fm_actionable_kpi(kpi_id))
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND public.is_functional_manager_of(k.employee_id)
  )
);

DROP POLICY IF EXISTS "FM can insert review_submissions on FM stage" ON public.review_submissions;
CREATE POLICY "FM can insert review_submissions on FM stage"
ON public.review_submissions
FOR INSERT
WITH CHECK (public.is_fm_actionable_kpi(kpi_id));
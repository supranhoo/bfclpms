-- 1. SECURITY DEFINER helper to avoid RLS recursion on profiles.
CREATE OR REPLACE FUNCTION public.is_functional_manager_of(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _employee_id
      AND p.functional_manager_id = auth.uid()
  );
$$;

-- 2. Hot-path index for the FM lookup.
CREATE INDEX IF NOT EXISTS idx_profiles_functional_manager_id
  ON public.profiles(functional_manager_id)
  WHERE functional_manager_id IS NOT NULL;

-- 3. kpis: FM read on mapped employees; FM update only on FM stage.
DROP POLICY IF EXISTS "FM can view KPIs of mapped employees" ON public.kpis;
CREATE POLICY "FM can view KPIs of mapped employees"
  ON public.kpis FOR SELECT TO authenticated
  USING (public.is_functional_manager_of(employee_id));

DROP POLICY IF EXISTS "FM can update KPI status on FM stage" ON public.kpis;
CREATE POLICY "FM can update KPI status on FM stage"
  ON public.kpis FOR UPDATE TO authenticated
  USING (
    public.is_functional_manager_of(employee_id)
    AND status = 'functional_manager_check'::public.review_status
  )
  WITH CHECK (public.is_functional_manager_of(employee_id));

-- 4. review_submissions: join via kpis to resolve employee_id.
DROP POLICY IF EXISTS "FM can view review_submissions of mapped employees" ON public.review_submissions;
CREATE POLICY "FM can view review_submissions of mapped employees"
  ON public.review_submissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND public.is_functional_manager_of(k.employee_id)
  ));

DROP POLICY IF EXISTS "FM can update review_submissions on FM stage" ON public.review_submissions;
CREATE POLICY "FM can update review_submissions on FM stage"
  ON public.review_submissions FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND public.is_functional_manager_of(k.employee_id)
      AND k.status = 'functional_manager_check'::public.review_status
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = review_submissions.kpi_id
      AND public.is_functional_manager_of(k.employee_id)
  ));

-- 5. kpi_observations: FM read + insert on mapped employees' KPIs.
DROP POLICY IF EXISTS "FM can view observations of mapped employees" ON public.kpi_observations;
CREATE POLICY "FM can view observations of mapped employees"
  ON public.kpi_observations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = kpi_observations.kpi_id
      AND public.is_functional_manager_of(k.employee_id)
  ));

DROP POLICY IF EXISTS "FM can insert observations on mapped employees" ON public.kpi_observations;
CREATE POLICY "FM can insert observations on mapped employees"
  ON public.kpi_observations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kpis k
      WHERE k.id = kpi_observations.kpi_id
        AND public.is_functional_manager_of(k.employee_id)
    )
  );

-- 6. kpi_queries: FM read + raise on mapped employees' KPIs.
DROP POLICY IF EXISTS "FM can view queries of mapped employees" ON public.kpi_queries;
CREATE POLICY "FM can view queries of mapped employees"
  ON public.kpi_queries FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kpis k
    WHERE k.id = kpi_queries.kpi_id
      AND public.is_functional_manager_of(k.employee_id)
  ));

DROP POLICY IF EXISTS "FM can raise queries on mapped employees" ON public.kpi_queries;
CREATE POLICY "FM can raise queries on mapped employees"
  ON public.kpi_queries FOR INSERT TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kpis k
      WHERE k.id = kpi_queries.kpi_id
        AND public.is_functional_manager_of(k.employee_id)
    )
  );
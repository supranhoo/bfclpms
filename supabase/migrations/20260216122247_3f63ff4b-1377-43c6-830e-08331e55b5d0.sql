
-- Allow org KPI data owners to INSERT review_submissions for org-level KPIs they manage
CREATE POLICY "Data owners can insert org-level submissions"
  ON public.review_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM kpis k
      JOIN org_kpi_data_owners o
        ON o.category_id = k.category_id
        AND o.kra_name = k.kra_name
        AND o.kpi_name = k.kpi_name
      WHERE k.id = review_submissions.kpi_id
        AND k.is_org_level = true
        AND o.owner_id = auth.uid()
    )
  );

-- Allow org KPI data owners to UPDATE review_submissions for org-level KPIs they manage (re-propagation)
CREATE POLICY "Data owners can update org-level submissions"
  ON public.review_submissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM kpis k
      JOIN org_kpi_data_owners o
        ON o.category_id = k.category_id
        AND o.kra_name = k.kra_name
        AND o.kpi_name = k.kpi_name
      WHERE k.id = review_submissions.kpi_id
        AND k.is_org_level = true
        AND o.owner_id = auth.uid()
    )
  );

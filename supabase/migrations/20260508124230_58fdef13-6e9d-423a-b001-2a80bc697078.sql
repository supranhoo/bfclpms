-- RCA 2026-05-08 — Org KPI propagation truth visibility for data owners.
-- The Org KPI snapshot RPC matches data-owner mappings against KPIs using
-- public.normalize_kpi_text() (lowercased, whitespace-collapsed, punctuation-
-- tolerant). The corresponding review_submissions policies still required
-- raw equality, so data owners (and edge cases where master kra/kpi text
-- diverges from the owner mapping) could see the KPI definition but not
-- the propagated submission rows. Result: the Org KPI Data Entry page
-- showed "Not propagated" for rows whose scorecard data already existed.
-- Fix: align the data-owner submission policies with the snapshot's
-- normalized matching contract.

DROP POLICY IF EXISTS "Data owners can view org-level submissions" ON public.review_submissions;
CREATE POLICY "Data owners can view org-level submissions"
ON public.review_submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.id = review_submissions.kpi_id
      AND k.is_org_level = true
      AND o.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Data owners can insert org-level submissions" ON public.review_submissions;
CREATE POLICY "Data owners can insert org-level submissions"
ON public.review_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.id = review_submissions.kpi_id
      AND k.is_org_level = true
      AND o.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Data owners can update org-level submissions" ON public.review_submissions;
CREATE POLICY "Data owners can update org-level submissions"
ON public.review_submissions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.id = review_submissions.kpi_id
      AND k.is_org_level = true
      AND o.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.id = review_submissions.kpi_id
      AND k.is_org_level = true
      AND o.owner_id = auth.uid()
  )
);
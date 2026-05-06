
-- 1. Reuse existing helper (param name "p")
CREATE OR REPLACE FUNCTION public.normalize_kpi_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(replace(lower(coalesce(p, '')), E'\r', ''), '\s+', ' ', 'g'))
$$;

-- 2. Expression indexes
CREATE INDEX IF NOT EXISTS idx_okdo_norm_triple
  ON public.org_kpi_data_owners (
    category_id,
    public.normalize_kpi_text(kra_name),
    public.normalize_kpi_text(kpi_name),
    owner_id
  );

CREATE INDEX IF NOT EXISTS idx_kpis_org_norm_triple
  ON public.kpis (
    category_id,
    public.normalize_kpi_text(kra_name),
    public.normalize_kpi_text(kpi_name)
  )
  WHERE is_org_level = true;

CREATE INDEX IF NOT EXISTS idx_okv_norm_triple
  ON public.org_kpi_values (
    category_id,
    public.normalize_kpi_text(kra_name),
    public.normalize_kpi_text(kpi_name)
  );

-- 3. Snapshot before in-place canonicalization
CREATE TABLE IF NOT EXISTS public.org_kpi_owner_key_backup_2026_05 AS
  SELECT * FROM public.org_kpi_data_owners WHERE false;

INSERT INTO public.org_kpi_owner_key_backup_2026_05
SELECT * FROM public.org_kpi_data_owners
WHERE kra_name <> btrim(regexp_replace(replace(coalesce(kra_name,''), E'\r',''), '\s+',' ','g'))
   OR kpi_name <> btrim(regexp_replace(replace(coalesce(kpi_name,''), E'\r',''), '\s+',' ','g'));

ALTER TABLE public.org_kpi_owner_key_backup_2026_05 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read org_kpi_owner_key_backup_2026_05" ON public.org_kpi_owner_key_backup_2026_05;
CREATE POLICY "Admins read org_kpi_owner_key_backup_2026_05"
  ON public.org_kpi_owner_key_backup_2026_05 FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

UPDATE public.org_kpi_data_owners SET
  kra_name = btrim(regexp_replace(replace(coalesce(kra_name,''), E'\r',''), '\s+',' ','g')),
  kpi_name = btrim(regexp_replace(replace(coalesce(kpi_name,''), E'\r',''), '\s+',' ','g'))
WHERE kra_name <> btrim(regexp_replace(replace(coalesce(kra_name,''), E'\r',''), '\s+',' ','g'))
   OR kpi_name <> btrim(regexp_replace(replace(coalesce(kpi_name,''), E'\r',''), '\s+',' ','g'));

-- 4. Replace affected RLS policies with normalized predicates

-- 4a. kpis: data owners read
DROP POLICY IF EXISTS "Data owners can view assigned org-level KPIs" ON public.kpis;
CREATE POLICY "Data owners can view assigned org-level KPIs"
  ON public.kpis FOR SELECT
  USING (
    is_org_level = true
    AND EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = auth.uid()
        AND o.category_id = kpis.category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(kpis.kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(kpis.kpi_name)
    )
  );

-- 4b. org_kpi_values: data owners insert
DROP POLICY IF EXISTS "Data owners can insert their assigned org_kpi_values" ON public.org_kpi_values;
CREATE POLICY "Data owners can insert their assigned org_kpi_values"
  ON public.org_kpi_values FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = auth.uid()
        AND o.category_id = org_kpi_values.category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(org_kpi_values.kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(org_kpi_values.kpi_name)
    )
  );

-- 4c. org_kpi_values: data owners update
DROP POLICY IF EXISTS "Data owners can update their assigned org_kpi_values" ON public.org_kpi_values;
CREATE POLICY "Data owners can update their assigned org_kpi_values"
  ON public.org_kpi_values FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o
      WHERE o.owner_id = auth.uid()
        AND o.category_id = org_kpi_values.category_id
        AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(org_kpi_values.kra_name)
        AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(org_kpi_values.kpi_name)
    )
  );
